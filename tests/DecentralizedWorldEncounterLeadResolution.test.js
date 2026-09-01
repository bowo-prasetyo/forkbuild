import { readFile } from 'node:fs/promises';
import {
    resolveDecentralizedWorldEncounterLead,
    resolveDecentralizedWorldEncounterLeadFromRegistry,
    DecentralizedWorldEncounterLeadResolutionStatus
} from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';

// 0.9.28 — Decentralized Lead → Encounter Resolution Boundary.
//
// See docs/Roadmap.md, "0.9.28 — Decentralized Lead → Encounter
// Resolution Boundary," for the full milestone story.
//
// Section 1: FLAGSHIP — exactly one lead with sufficient evidence
//            resolves; the identical scenario with no evidence supplied
//            resolves UNAVAILABLE.
// Section 2: two leads both connected by evidence to the same material
//            resolve AMBIGUOUS — no lead is ever preferred.
// Section 3: a discoveryTag or uri shared with the requested material is
//            never, by itself, treated as association evidence.
// Section 4: evidence naming a lead the registry no longer holds resolves
//            UNAVAILABLE, never a stale candidate.
// Section 5: malformed input degrades to UNAVAILABLE, never throws.
// Section 6: duplicate evidence for the same lead still counts as one
//            candidate.
// Section 7: resolveDecentralizedWorldEncounterLeadFromRegistry() mirrors
//            the plain-array function over registry.listLeads().
// Section 8: architectural regression — no inference, ranking, retrieval,
//            or trust vocabulary; no `.find()`-style "pick one" among
//            genuinely ambiguous candidates.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function leadOf(overrides = {}) {
    return describeDecentralizedWorldDiscoveryLead({
        origin: 'dweb:some-search-service',
        discoveryTag: 'forkbuild_random_unique',
        uri: 'ar://ABC123',
        storage: 'ar',
        ...overrides
    });
}

function associationFor(lead, material) {
    return { origin: lead.origin, discoveryTag: lead.discoveryTag, uri: lead.uri, ...material };
}

const publicationMaterial = Object.freeze({ kind: 'PUBLICATION', objectId: 'pub-1' });

// ---------------------------------------------------------------------
// 1. Flagship
// ---------------------------------------------------------------------
{
    const lead = leadOf();
    const association = associationFor(lead, publicationMaterial);

    const resolved = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead],
        associations: [association]
    });
    assert(resolved.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, '1. FLAGSHIP — a single well-evidenced lead resolves RESOLVED');
    assert(resolved.resolvedLead === lead, '2. FLAGSHIP — resolvedLead is the exact lead reference, never a copy');
    assert(resolved.candidates.length === 1 && resolved.candidates[0] === lead, '3. FLAGSHIP — candidates carries exactly that one lead');

    const noEvidence = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead],
        associations: []
    });
    assert(noEvidence.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, '4. FLAGSHIP — the identical lead with no supplied evidence resolves UNAVAILABLE');
    assert(noEvidence.resolvedLead === null && noEvidence.candidates.length === 0, '5. FLAGSHIP — UNAVAILABLE never carries a resolvedLead or candidates');

    console.log('✓ Flagship: sufficient evidence resolves RESOLVED; the same lead with no evidence resolves UNAVAILABLE');
}

// ---------------------------------------------------------------------
// 2. Two leads connected to the same material resolve AMBIGUOUS.
// ---------------------------------------------------------------------
{
    const leadA = leadOf({ origin: 'dweb:service-a', uri: 'ar://AAA' });
    const leadB = leadOf({ origin: 'dweb:service-b', uri: 'ar://BBB' });
    const associations = [associationFor(leadA, publicationMaterial), associationFor(leadB, publicationMaterial)];

    const result = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [leadA, leadB],
        associations
    });
    assert(result.status === DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS, 'two independently-evidenced leads resolve AMBIGUOUS');
    assert(result.resolvedLead === null, 'AMBIGUOUS never carries a resolvedLead');
    assert(result.candidates.length === 2 && result.candidates.includes(leadA) && result.candidates.includes(leadB), 'AMBIGUOUS candidates carries every matching lead, in association order');

    console.log('✓ Two leads connected to the same material resolve AMBIGUOUS, no lead preferred');
}

// ---------------------------------------------------------------------
// 3. A shared discoveryTag or uri, alone, is never treated as evidence —
//    only an explicit association counts.
// ---------------------------------------------------------------------
{
    const lead = leadOf();
    const result = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead],
        associations: []
    });
    assert(result.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'a lead sharing the discoveryTag pipeline reports UNAVAILABLE absent explicit evidence, even though its own uri could easily be mistaken for "the" material location');

    const otherObjectAssociation = associationFor(lead, { kind: 'PUBLICATION', objectId: 'pub-OTHER' });
    const wrongObject = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead],
        associations: [otherObjectAssociation]
    });
    assert(wrongObject.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'evidence for a different objectId never resolves the requested material');

    const wrongKindAssociation = associationFor(lead, { kind: 'AVATAR', objectId: 'pub-1' });
    const wrongKind = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead],
        associations: [wrongKindAssociation]
    });
    assert(wrongKind.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'evidence for the same objectId but a different kind never resolves the requested material');

    console.log('✓ A shared discoveryTag or uri is never, by itself, treated as association evidence');
}

// ---------------------------------------------------------------------
// 4. Evidence naming a lead the registry no longer holds resolves
//    UNAVAILABLE, never a stale candidate.
// ---------------------------------------------------------------------
{
    const lead = leadOf();
    const association = associationFor(lead, publicationMaterial);

    const result = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [],
        associations: [association]
    });
    assert(result.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'evidence naming a lead absent from the currently-known leads resolves UNAVAILABLE');
    assert(result.candidates.length === 0, 'no stale candidate is ever surfaced');

    console.log('✓ Evidence naming a lead the registry no longer holds resolves UNAVAILABLE, not a stale candidate');
}

// ---------------------------------------------------------------------
// 5. Malformed input degrades to UNAVAILABLE, never throws.
// ---------------------------------------------------------------------
{
    const lead = leadOf();
    const association = associationFor(lead, publicationMaterial);

    assert(resolveDecentralizedWorldEncounterLead().status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'no arguments at all resolves UNAVAILABLE');
    assert(resolveDecentralizedWorldEncounterLead({}).status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'an empty options object resolves UNAVAILABLE');
    assert(resolveDecentralizedWorldEncounterLead({ requestedMaterial: { kind: 'PUBLICATION', objectId: '' }, leads: [lead], associations: [association] }).status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'an empty objectId resolves UNAVAILABLE');
    assert(resolveDecentralizedWorldEncounterLead({ requestedMaterial: { kind: 'SOMETHING_ELSE', objectId: 'pub-1' }, leads: [lead], associations: [association] }).status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'an unrecognized kind resolves UNAVAILABLE');
    assert(resolveDecentralizedWorldEncounterLead({ requestedMaterial: publicationMaterial, leads: 'not-an-array', associations: [association] }).status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'a non-array leads argument is treated as empty');
    assert(resolveDecentralizedWorldEncounterLead({ requestedMaterial: publicationMaterial, leads: [lead], associations: 'not-an-array' }).status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'a non-array associations argument is treated as empty');

    const mixedAssociations = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead],
        associations: [null, {}, { origin: '' }, association]
    });
    assert(mixedAssociations.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'malformed entries within associations never block a well-formed one');

    console.log('✓ Malformed input degrades to UNAVAILABLE, never throws');
}

// ---------------------------------------------------------------------
// 6. Duplicate evidence for the same lead counts once, not twice.
// ---------------------------------------------------------------------
{
    const lead = leadOf();
    const association = associationFor(lead, publicationMaterial);

    const result = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead],
        associations: [association, { ...association }]
    });
    assert(result.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'two associations naming the same lead still resolve RESOLVED, not AMBIGUOUS');
    assert(result.candidates.length === 1, 'the same lead is never counted twice among candidates');

    console.log('✓ Duplicate evidence for the same lead counts once toward resolution, never twice');
}

// ---------------------------------------------------------------------
// 7. resolveDecentralizedWorldEncounterLeadFromRegistry() mirrors the
//    plain-array function over registry.listLeads().
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const lead = leadOf();
    registry.setLead(lead);
    const association = associationFor(lead, publicationMaterial);

    const viaRegistry = resolveDecentralizedWorldEncounterLeadFromRegistry({
        requestedMaterial: publicationMaterial,
        registry,
        associations: [association]
    });
    const viaPlainArray = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: registry.listLeads(),
        associations: [association]
    });
    assert(viaRegistry.status === viaPlainArray.status && viaRegistry.resolvedLead === viaPlainArray.resolvedLead, 'the registry wrapper returns exactly what the plain-array function returns for the same snapshot');

    registry.removeLead(lead.origin, lead.discoveryTag, lead.uri);
    const afterRemoval = resolveDecentralizedWorldEncounterLeadFromRegistry({
        requestedMaterial: publicationMaterial,
        registry,
        associations: [association]
    });
    assert(afterRemoval.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'once a lead is removed from the registry, evidence naming it resolves UNAVAILABLE');

    assert(resolveDecentralizedWorldEncounterLeadFromRegistry({ requestedMaterial: publicationMaterial, registry: {}, associations: [association] }).status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'a registry with no listLeads() is treated as contributing no leads');

    console.log('✓ resolveDecentralizedWorldEncounterLeadFromRegistry() mirrors the plain-array function over registry.listLeads()');
}

// ---------------------------------------------------------------------
// 8. Architectural regression.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/DecentralizedWorldEncounterLeadResolution.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    assert(!codeOnly.includes('ContentReference'), 'the resolver code must never reference ContentReference');
    assert(!codeOnly.includes('DecentralizedPublication'), 'the resolver code must never reference DecentralizedPublication');
    assert(!codeOnly.includes('WorldEncounterMaterialLoading'), 'the resolver code must never reference WorldEncounterMaterialLoading — wiring a materialSources.decentralized slot is unscheduled');
    assert(!/fetch\(/.test(codeOnly), 'the resolver code must never call fetch(...) directly');
    assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), 'the resolver code must never schedule or poll on its own');
    assert(!codeOnly.includes('.discoveryTag ===') && !codeOnly.includes('.uri ==='), 'the resolver code must never compare a lead\'s own discoveryTag/uri against requestedMaterial directly — only through an explicit association');

    const forbiddenTerms = ['trusted', 'verified', 'authority', 'priority', 'weight', 'confidence', 'preferred', 'best match', 'scoring'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `the resolver code must never use "${term}"`);
    }

    console.log('✓ Architectural regression: no retrieval, ranking, or direct tag/uri inference vocabulary');
}

console.log('\nAll DecentralizedWorldEncounterLeadResolution tests passed.');
