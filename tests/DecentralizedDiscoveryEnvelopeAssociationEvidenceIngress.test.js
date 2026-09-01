import { readFile } from 'node:fs/promises';
import {
    deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes,
    deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry
} from '../application/DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';
import {
    resolveDecentralizedWorldEncounterLead,
    DecentralizedWorldEncounterLeadResolutionStatus
} from '../application/DecentralizedWorldEncounterLeadResolution.js';

// 0.9.32 — Decentralized Discovery Envelope Association Evidence.
//
// See docs/Roadmap.md, "0.9.32 — Decentralized Discovery Envelope
// Association Evidence," for the full milestone story.
//
// Section 1: FLAGSHIP — an envelope declaring a currently-known lead's own
//            uri produces exactly one association, and it feeds 0.9.28's
//            own resolution to RESOLVED end to end.
// Section 2: an envelope whose uri matches no currently-known lead
//            produces no association.
// Section 3: two independent leads sharing a declared uri each produce
//            their own association — neither preferred; feeding both into
//            0.9.28's resolution yields AMBIGUOUS.
// Section 4: both PUBLICATION and AVATAR envelope kinds flow through
//            unchanged, unlike 0.9.29's own Publication-only producer.
// Section 5: malformed input degrades to an empty array, never throws.
// Section 6: deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry()
//            mirrors the plain-array function over registry.listLeads().
// Section 7: architectural regression — no verification, ranking,
//            retrieval, or merge into 0.9.29's own ingress; no second
//            validation algorithm.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild',
        version: 1,
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        uri: 'ar://ABC123',
        ...overrides
    };
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

// ---------------------------------------------------------------------
// 1. Flagship
// ---------------------------------------------------------------------
{
    const envelope = envelopeOf();
    const lead = leadOf();

    const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [envelope],
        leads: [lead]
    });
    assert(associations.length === 1, '1. FLAGSHIP — exactly one association is produced');
    assert(associations[0].origin === lead.origin && associations[0].discoveryTag === lead.discoveryTag && associations[0].uri === lead.uri, '2. FLAGSHIP — the association carries the matching lead\'s own identity triple');
    assert(associations[0].kind === 'PUBLICATION' && associations[0].objectId === 'pub-1', '3. FLAGSHIP — the association carries the envelope\'s own material identity');
    assert(Object.isFrozen(associations), '4. FLAGSHIP — the result array is frozen');

    const resolved = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: { kind: 'PUBLICATION', objectId: 'pub-1' },
        leads: [lead],
        associations
    });
    assert(resolved.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, '5. FLAGSHIP — the produced evidence resolves RESOLVED end to end through 0.9.28\'s own resolution');
    assert(resolved.resolvedLead === lead, '6. FLAGSHIP — the resolved lead is the exact lead reference');

    // Also works when handed an already-described envelope, not just a
    // raw candidate object — "duck-typed, re-validated" per this file's
    // own header.
    const alreadyDescribed = describeDecentralizedDiscoveryEnvelope(envelope);
    const fromDescribed = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [alreadyDescribed],
        leads: [lead]
    });
    assert(fromDescribed.length === 1 && fromDescribed[0].objectId === 'pub-1', '7. FLAGSHIP — an already-described envelope produces the same association');

    console.log('✓ Flagship: an envelope\'s declaration, matched against a known lead, produces real evidence that resolves end to end');
}

// ---------------------------------------------------------------------
// 2. An envelope whose uri matches no currently-known lead produces
//    nothing.
// ---------------------------------------------------------------------
{
    const envelope = envelopeOf();
    const unrelatedLead = leadOf({ uri: 'ar://SOMETHING_ELSE' });

    const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [envelope],
        leads: [unrelatedLead]
    });
    assert(associations.length === 0, 'an envelope matching no known lead\'s uri produces no association');

    const noLeadsAtAll = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({ envelopes: [envelope], leads: [] });
    assert(noLeadsAtAll.length === 0, 'no currently-known leads at all produces no association');

    console.log('✓ An envelope matching no currently-known lead\'s uri produces no association');
}

// ---------------------------------------------------------------------
// 3. Two independent leads sharing a declared uri each produce their own
//    association — feeding both to resolution yields AMBIGUOUS.
// ---------------------------------------------------------------------
{
    const envelope = envelopeOf();
    const leadA = leadOf({ origin: 'dweb:service-a' });
    const leadB = leadOf({ origin: 'dweb:service-b' });

    const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [envelope],
        leads: [leadA, leadB]
    });
    assert(associations.length === 2, 'two independent leads sharing the declared uri each produce their own association');
    assert(associations[0].origin === 'dweb:service-a' && associations[1].origin === 'dweb:service-b', 'associations are ordered by matching leads in the order supplied');

    const resolved = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: { kind: 'PUBLICATION', objectId: 'pub-1' },
        leads: [leadA, leadB],
        associations
    });
    assert(resolved.status === DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS, 'evidence for two independently-known leads sharing a uri resolves AMBIGUOUS, never a preferred pick');

    console.log('✓ Independent leads sharing a declared uri each produce their own association, resolving AMBIGUOUS — never preferred');
}

// ---------------------------------------------------------------------
// 4. Both PUBLICATION and AVATAR envelope kinds flow through unchanged.
// ---------------------------------------------------------------------
{
    const lead = leadOf();

    const publicationAssociations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [envelopeOf({ kind: 'PUBLICATION', objectId: 'pub-1' })],
        leads: [lead]
    });
    assert(publicationAssociations.length === 1 && publicationAssociations[0].kind === 'PUBLICATION', 'a PUBLICATION envelope produces a PUBLICATION association');

    const avatarAssociations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [envelopeOf({ kind: 'AVATAR', objectId: 'avatar-7' })],
        leads: [lead]
    });
    assert(avatarAssociations.length === 1 && avatarAssociations[0].kind === 'AVATAR' && avatarAssociations[0].objectId === 'avatar-7', 'an AVATAR envelope produces an AVATAR association — unlike 0.9.29\'s own Publication-only producer');

    const resolvedAvatar = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: { kind: 'AVATAR', objectId: 'avatar-7' },
        leads: [lead],
        associations: avatarAssociations
    });
    assert(resolvedAvatar.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'AVATAR association evidence resolves end to end through 0.9.28\'s own resolution, unchanged');

    console.log('✓ Both PUBLICATION and AVATAR envelope kinds flow through unchanged, unlike 0.9.29\'s own Publication-only producer');
}

// ---------------------------------------------------------------------
// 5. Malformed input degrades to an empty array, never throws.
// ---------------------------------------------------------------------
{
    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes().length === 0, 'no arguments at all degrades to an empty array');
    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({}).length === 0, 'an empty options object degrades to an empty array');
    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({ envelopes: 'not-an-array', leads: [leadOf()] }).length === 0, 'a non-array envelopes argument is treated as empty');
    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({ envelopes: [envelopeOf()], leads: 'not-an-array' }).length === 0, 'a non-array leads argument is treated as empty');

    const mixedEnvelopes = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [null, {}, envelopeOf({ objectId: '' }), envelopeOf({ protocol: 'unrelated-app' }), envelopeOf()],
        leads: [leadOf()]
    });
    assert(mixedEnvelopes.length === 1, 'malformed entries within envelopes never block a well-formed one');

    const mixedLeads = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [envelopeOf()],
        leads: [null, {}, { origin: 'x', discoveryTag: 'y' }, leadOf()]
    });
    assert(mixedLeads.length === 1, 'malformed entries within leads never block a well-formed one');

    console.log('✓ Malformed input degrades to an empty array, never throws');
}

// ---------------------------------------------------------------------
// 6. deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry()
//    mirrors the plain-array function over registry.listLeads().
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const lead = leadOf();
    registry.setLead(lead);
    const envelope = envelopeOf();

    const viaRegistry = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry({
        envelopes: [envelope],
        registry
    });
    const viaPlainArray = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [envelope],
        leads: registry.listLeads()
    });
    assert(viaRegistry.length === viaPlainArray.length && viaRegistry[0].uri === viaPlainArray[0].uri, 'the registry wrapper returns exactly what the plain-array function returns for the same snapshot');

    registry.removeLead(lead.origin, lead.discoveryTag, lead.uri);
    const afterRemoval = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry({ envelopes: [envelope], registry });
    assert(afterRemoval.length === 0, 'once a lead is removed from the registry, its associations are no longer produced');

    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry({ envelopes: [envelope], registry: {} }).length === 0, 'a registry with no listLeads() is treated as contributing no leads');

    console.log('✓ deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry() mirrors the plain-array function over registry.listLeads()');
}

// ---------------------------------------------------------------------
// 7. Architectural regression.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    assert(!codeOnly.includes('LocalAuthorizationVerifier'), 'the ingress code must never verify a signature');
    assert(!codeOnly.includes('ContentReference'), 'the ingress code must never reference ContentReference');
    assert(!codeOnly.includes('Publication'), 'the ingress code must never reference a Publication or its location claim');
    assert(!codeOnly.includes('DecentralizedWorldEncounterLeadAssociationEvidenceIngress'), 'the ingress code must never import or merge into 0.9.29\'s own ingress file');
    assert(!/fetch\(/.test(codeOnly), 'the ingress code must never call fetch(...) directly');
    assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), 'the ingress code must never schedule or poll on its own');

    const forbiddenTerms = ['trusted', 'verified', 'authority', 'priority', 'weight', 'confidence', 'preferred', 'best match', 'scoring', 'signature'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `the ingress code must never use "${term}"`);
    }

    console.log('✓ Architectural regression: no verification, ranking, retrieval, or merge into 0.9.29\'s own ingress');
}

console.log('\nAll DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress tests passed.');
