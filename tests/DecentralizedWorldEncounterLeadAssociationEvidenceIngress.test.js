import { readFile } from 'node:fs/promises';
import {
    deriveDecentralizedWorldEncounterLeadAssociationEvidence,
    deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry
} from '../application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';
import {
    resolveDecentralizedWorldEncounterLead,
    DecentralizedWorldEncounterLeadResolutionStatus
} from '../application/DecentralizedWorldEncounterLeadResolution.js';

// 0.9.29 — Decentralized Association Evidence Ingress.
//
// See docs/Roadmap.md, "0.9.29 — Decentralized Association Evidence
// Ingress," for the full milestone story.
//
// Section 1: FLAGSHIP — a signed publication claiming a currently-known
//            lead's own uri produces exactly one association, and it
//            feeds 0.9.28's own resolution to RESOLVED end to end.
// Section 2: a claim whose uri matches no currently-known lead produces
//            no association.
// Section 3: two independent leads sharing a claimed uri each produce
//            their own association — neither preferred; feeding both into
//            0.9.28's resolution yields AMBIGUOUS.
// Section 4: an unsigned publication, or one with no contentReference,
//            never produces an association.
// Section 5: malformed input degrades to an empty array, never throws.
// Section 6: deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry()
//            mirrors the plain-array function over registry.listLeads().
// Section 7: architectural regression — no verification, ranking,
//            retrieval, or avatar-producing vocabulary; no second
//            validation algorithm.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function publicationOf(overrides = {}) {
    return {
        id: 'pub-1',
        signature: { signer: 'alice', algorithm: 'ed25519', signature: 'deadbeef' },
        contentReference: { hash: 'sha256:ABC', uri: 'ar://ABC123', storage: 'ar' },
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
    const publication = publicationOf();
    const lead = leadOf();

    const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidence({
        publications: [publication],
        leads: [lead]
    });
    assert(associations.length === 1, '1. FLAGSHIP — exactly one association is produced');
    assert(associations[0].origin === lead.origin && associations[0].discoveryTag === lead.discoveryTag && associations[0].uri === lead.uri, '2. FLAGSHIP — the association carries the matching lead\'s own identity triple');
    assert(associations[0].kind === 'PUBLICATION' && associations[0].objectId === 'pub-1', '3. FLAGSHIP — the association carries the claim\'s own material identity');
    assert(Object.isFrozen(associations), '4. FLAGSHIP — the result array is frozen');

    const resolved = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: { kind: 'PUBLICATION', objectId: 'pub-1' },
        leads: [lead],
        associations
    });
    assert(resolved.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, '5. FLAGSHIP — the produced evidence resolves RESOLVED end to end through 0.9.28\'s own resolution');
    assert(resolved.resolvedLead === lead, '6. FLAGSHIP — the resolved lead is the exact lead reference');

    console.log('✓ Flagship: a signed publication\'s claim, matched against a known lead, produces real evidence that resolves end to end');
}

// ---------------------------------------------------------------------
// 2. A claim whose uri matches no currently-known lead produces nothing.
// ---------------------------------------------------------------------
{
    const publication = publicationOf();
    const unrelatedLead = leadOf({ uri: 'ar://SOMETHING_ELSE' });

    const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidence({
        publications: [publication],
        leads: [unrelatedLead]
    });
    assert(associations.length === 0, 'a claim matching no known lead\'s uri produces no association');

    const noLeadsAtAll = deriveDecentralizedWorldEncounterLeadAssociationEvidence({ publications: [publication], leads: [] });
    assert(noLeadsAtAll.length === 0, 'no currently-known leads at all produces no association');

    console.log('✓ A claim matching no currently-known lead\'s uri produces no association');
}

// ---------------------------------------------------------------------
// 3. Two independent leads sharing a claimed uri each produce their own
//    association — feeding both to resolution yields AMBIGUOUS.
// ---------------------------------------------------------------------
{
    const publication = publicationOf();
    const leadA = leadOf({ origin: 'dweb:service-a' });
    const leadB = leadOf({ origin: 'dweb:service-b' });

    const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidence({
        publications: [publication],
        leads: [leadA, leadB]
    });
    assert(associations.length === 2, 'two independent leads sharing the claimed uri each produce their own association');
    assert(associations[0].origin === 'dweb:service-a' && associations[1].origin === 'dweb:service-b', 'associations are ordered by matching leads in the order supplied');

    const resolved = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: { kind: 'PUBLICATION', objectId: 'pub-1' },
        leads: [leadA, leadB],
        associations
    });
    assert(resolved.status === DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS, 'evidence for two independently-known leads sharing a uri resolves AMBIGUOUS, never a preferred pick');

    console.log('✓ Independent leads sharing a claimed uri each produce their own association, resolving AMBIGUOUS — never preferred');
}

// ---------------------------------------------------------------------
// 4. An unsigned publication, or one missing a contentReference, never
//    produces an association.
// ---------------------------------------------------------------------
{
    const lead = leadOf();

    const unsigned = deriveDecentralizedWorldEncounterLeadAssociationEvidence({
        publications: [publicationOf({ signature: null })],
        leads: [lead]
    });
    assert(unsigned.length === 0, 'an unsigned publication never produces an association');

    const noContentReference = deriveDecentralizedWorldEncounterLeadAssociationEvidence({
        publications: [publicationOf({ contentReference: null })],
        leads: [lead]
    });
    assert(noContentReference.length === 0, 'a publication with no contentReference never produces an association');

    console.log('✓ An unsigned publication, or one missing a contentReference, never produces an association');
}

// ---------------------------------------------------------------------
// 5. Malformed input degrades to an empty array, never throws.
// ---------------------------------------------------------------------
{
    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidence().length === 0, 'no arguments at all degrades to an empty array');
    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidence({}).length === 0, 'an empty options object degrades to an empty array');
    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidence({ publications: 'not-an-array', leads: [leadOf()] }).length === 0, 'a non-array publications argument is treated as empty');
    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidence({ publications: [publicationOf()], leads: 'not-an-array' }).length === 0, 'a non-array leads argument is treated as empty');

    const mixedPublications = deriveDecentralizedWorldEncounterLeadAssociationEvidence({
        publications: [null, {}, publicationOf({ id: '' }), publicationOf()],
        leads: [leadOf()]
    });
    assert(mixedPublications.length === 1, 'malformed entries within publications never block a well-formed one');

    const mixedLeads = deriveDecentralizedWorldEncounterLeadAssociationEvidence({
        publications: [publicationOf()],
        leads: [null, {}, { origin: 'x', discoveryTag: 'y' }, leadOf()]
    });
    assert(mixedLeads.length === 1, 'malformed entries within leads never block a well-formed one');

    console.log('✓ Malformed input degrades to an empty array, never throws');
}

// ---------------------------------------------------------------------
// 6. deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry()
//    mirrors the plain-array function over registry.listLeads().
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const lead = leadOf();
    registry.setLead(lead);
    const publication = publicationOf();

    const viaRegistry = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry({
        publications: [publication],
        registry
    });
    const viaPlainArray = deriveDecentralizedWorldEncounterLeadAssociationEvidence({
        publications: [publication],
        leads: registry.listLeads()
    });
    assert(viaRegistry.length === viaPlainArray.length && viaRegistry[0].uri === viaPlainArray[0].uri, 'the registry wrapper returns exactly what the plain-array function returns for the same snapshot');

    registry.removeLead(lead.origin, lead.discoveryTag, lead.uri);
    const afterRemoval = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry({ publications: [publication], registry });
    assert(afterRemoval.length === 0, 'once a lead is removed from the registry, its associations are no longer produced');

    assert(deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry({ publications: [publication], registry: {} }).length === 0, 'a registry with no listLeads() is treated as contributing no leads');

    console.log('✓ deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry() mirrors the plain-array function over registry.listLeads()');
}

// ---------------------------------------------------------------------
// 7. Architectural regression.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    assert(!codeOnly.includes('LocalAuthorizationVerifier'), 'the ingress code must never verify a signature');
    assert(!codeOnly.includes('ContentReference'), 'the ingress code must never reference ContentReference');
    assert(!codeOnly.includes("'AVATAR'") && !codeOnly.includes('WorldEncounterKind.AVATAR'), 'the ingress code must never produce AVATAR evidence');
    assert(!/fetch\(/.test(codeOnly), 'the ingress code must never call fetch(...) directly');
    assert(!codeOnly.includes('setTimeout') && !codeOnly.includes('setInterval'), 'the ingress code must never schedule or poll on its own');

    const forbiddenTerms = ['trusted', 'verified', 'authority', 'priority', 'weight', 'confidence', 'preferred', 'best match', 'scoring'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `the ingress code must never use "${term}"`);
    }

    console.log('✓ Architectural regression: no verification, ranking, retrieval, or avatar-producing vocabulary');
}

console.log('\nAll DecentralizedWorldEncounterLeadAssociationEvidenceIngress tests passed.');
