import { readFile } from 'node:fs/promises';
import {
    describeDecentralizedWorldEncounterLeadSelectionOutcome,
    describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry,
    DecentralizedWorldEncounterLeadSelectionOutcomeStatus
} from '../application/DecentralizedWorldEncounterLeadSelection.js';
import {
    resolveDecentralizedWorldEncounterLead,
    DecentralizedWorldEncounterLeadResolutionStatus
} from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';

// 0.9.40 — Decentralized Lead Resolution Integration.
// See docs/Roadmap.md, "0.9.40 — Decentralized Lead Resolution
// Integration."
//
// `application/DecentralizedWorldEncounterLeadSelection.js` is a thin
// renaming seam over 0.9.28's own already-authoritative
// `resolveDecentralizedWorldEncounterLead()`/
// `resolveDecentralizedWorldEncounterLeadFromRegistry()` — this file pins
// down that the seam changes nothing about the underlying resolution
// itself, only the argument name a UI-facing caller uses.
//
// Section 1: FLAGSHIP — `describeDecentralizedWorldEncounterLeadSelectionOutcome()`
//            returns byte-identical results to
//            `resolveDecentralizedWorldEncounterLead()` for the same
//            evidence, across UNAVAILABLE/RESOLVED/AMBIGUOUS.
// Section 2: `selectedEncounter` needs no `origin` field — a bare
//            `{ kind, objectId }` selection resolves exactly like the same
//            pair supplied directly as `requestedMaterial`.
// Section 3: `DecentralizedWorldEncounterLeadSelectionOutcomeStatus` is the
//            exact same object as `DecentralizedWorldEncounterLeadResolutionStatus`
//            — not a re-typed enum with matching values.
// Section 4: malformed input degrades to UNAVAILABLE, never throws.
// Section 5: `describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()`
//            mirrors 0.9.28's own registry wrapper exactly.
// Section 6: architectural regression — no association/matching logic of
//            its own, no core/ import, no rank/trust/preferred vocabulary.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
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

    const viaSelection = describeDecentralizedWorldEncounterLeadSelectionOutcome({
        selectedEncounter: publicationMaterial,
        leads: [lead],
        associations: [association]
    });
    const viaResolution = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead],
        associations: [association]
    });
    assert(serialize(viaSelection) === serialize(viaResolution), '1. FLAGSHIP — RESOLVED: the selection seam returns byte-identical output to calling 0.9.28 directly');
    assert(viaSelection.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.RESOLVED, '2. FLAGSHIP — status is RESOLVED for a single well-evidenced lead');
    assert(viaSelection.resolvedLead === lead, '3. FLAGSHIP — resolvedLead is the exact lead reference, never a copy');

    const secondLead = leadOf({ origin: 'dweb:another-service', uri: 'ar://DEF456' });
    const secondAssociation = associationFor(secondLead, publicationMaterial);
    const ambiguousViaSelection = describeDecentralizedWorldEncounterLeadSelectionOutcome({
        selectedEncounter: publicationMaterial,
        leads: [lead, secondLead],
        associations: [association, secondAssociation]
    });
    const ambiguousViaResolution = resolveDecentralizedWorldEncounterLead({
        requestedMaterial: publicationMaterial,
        leads: [lead, secondLead],
        associations: [association, secondAssociation]
    });
    assert(serialize(ambiguousViaSelection) === serialize(ambiguousViaResolution), '4. FLAGSHIP — AMBIGUOUS: the selection seam returns byte-identical output to calling 0.9.28 directly');
    assert(ambiguousViaSelection.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.AMBIGUOUS, '5. FLAGSHIP — status is AMBIGUOUS for two independently-evidenced leads');
    assert(ambiguousViaSelection.resolvedLead === null, '6. FLAGSHIP — AMBIGUOUS never picks one lead for the caller');

    const noEvidenceViaSelection = describeDecentralizedWorldEncounterLeadSelectionOutcome({
        selectedEncounter: publicationMaterial,
        leads: [lead],
        associations: []
    });
    assert(noEvidenceViaSelection.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.UNAVAILABLE, '7. FLAGSHIP — UNAVAILABLE: the identical lead with no supplied evidence resolves UNAVAILABLE');
    assert(noEvidenceViaSelection.resolvedLead === null && noEvidenceViaSelection.candidates.length === 0, '8. FLAGSHIP — UNAVAILABLE never carries a resolvedLead or candidates');

    console.log('✓ Flagship: the selection seam returns byte-identical output to 0.9.28\'s own resolution, across UNAVAILABLE/RESOLVED/AMBIGUOUS');
}

// ---------------------------------------------------------------------
// 2. selectedEncounter needs no origin field.
// ---------------------------------------------------------------------
{
    const lead = leadOf();
    const association = associationFor(lead, publicationMaterial);

    const withOrigin = describeDecentralizedWorldEncounterLeadSelectionOutcome({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' },
        leads: [lead],
        associations: [association]
    });
    const withoutOrigin = describeDecentralizedWorldEncounterLeadSelectionOutcome({
        selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' },
        leads: [lead],
        associations: [association]
    });
    assert(serialize(withOrigin) === serialize(withoutOrigin), '9. an extra origin field on selectedEncounter is silently ignored — resolution only ever reads kind/objectId');
    assert(withoutOrigin.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.RESOLVED, '10. a bare { kind, objectId } selection resolves exactly like requestedMaterial already does one layer down');

    console.log('✓ selectedEncounter needs no origin field — only kind/objectId are ever read');
}

// ---------------------------------------------------------------------
// 3. The status object is reused, not re-typed.
// ---------------------------------------------------------------------
{
    assert(DecentralizedWorldEncounterLeadSelectionOutcomeStatus === DecentralizedWorldEncounterLeadResolutionStatus, '11. DecentralizedWorldEncounterLeadSelectionOutcomeStatus is the exact same object reference as 0.9.28\'s own status enum, not a re-typed copy');

    console.log('✓ The status enum is reused verbatim from 0.9.28, never re-typed');
}

// ---------------------------------------------------------------------
// 4. Malformed / empty input degrades to UNAVAILABLE, never throws.
// ---------------------------------------------------------------------
{
    for (const selectedEncounter of [undefined, null, {}, { kind: 'PUBLICATION' }, { objectId: 'pub-1' }, { kind: 'NOT_A_KIND', objectId: 'pub-1' }]) {
        const outcome = describeDecentralizedWorldEncounterLeadSelectionOutcome({ selectedEncounter, leads: [], associations: [] });
        assert(outcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.UNAVAILABLE, `12. a malformed selectedEncounter ${serialize(selectedEncounter)} degrades to UNAVAILABLE, never throws`);
    }
    for (const leads of [undefined, null, 'not-an-array', 7, {}]) {
        const outcome = describeDecentralizedWorldEncounterLeadSelectionOutcome({ selectedEncounter: publicationMaterial, leads, associations: [] });
        assert(outcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.UNAVAILABLE, `13. malformed leads ${serialize(leads)} degrades to UNAVAILABLE, never throws`);
    }
    assert(describeDecentralizedWorldEncounterLeadSelectionOutcome().status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.UNAVAILABLE, '14. calling with no arguments at all degrades to UNAVAILABLE, never throws');
    assert(describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry().status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.UNAVAILABLE, '15. the registry wrapper called with no arguments also degrades to UNAVAILABLE, never throws');

    console.log('✓ Malformed or empty input degrades to UNAVAILABLE throughout, never throws');
}

// ---------------------------------------------------------------------
// 5. describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()
//    mirrors 0.9.28's own registry wrapper exactly.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const lead = leadOf();
    registry.setLead(lead);
    const association = associationFor(lead, publicationMaterial);

    const outcome = describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry({
        selectedEncounter: publicationMaterial,
        registry,
        associations: [association]
    });
    assert(outcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.RESOLVED, '16. the registry wrapper classifies from the registry\'s own current listLeads() snapshot');
    assert(outcome.resolvedLead === lead, '17. the registry wrapper\'s resolvedLead is the exact lead instance the registry holds');

    const malformedRegistry = {};
    const degraded = describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry({ selectedEncounter: publicationMaterial, registry: malformedRegistry, associations: [association] });
    assert(degraded.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.UNAVAILABLE, '18. a registry missing listLeads() degrades to UNAVAILABLE, never throws');

    console.log('✓ describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry(): mirrors 0.9.28\'s own registry wrapper shape');
}

// ---------------------------------------------------------------------
// 6. Architectural regression: forbidden imports and vocabulary.
// ---------------------------------------------------------------------
{
    const path = '../application/DecentralizedWorldEncounterLeadSelection.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes("from '../core/"), '19. never imports a core/ module directly');
    assert(!codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry.js'), '20. never imports the lead registry class directly — only reads an already-supplied registry\'s listLeads() via 0.9.28\'s own wrapper');
    assert(!codeOnly.includes('DecentralizedWorldDiscoveryQuery'), '21. never imports a discovery query module of any kind');
    assert(!/fetch\(/.test(codeOnly), '22. never calls fetch(...)');
    assert(!codeOnly.includes('WebSocket'), '23. never references WebSocket');
    assert(!/\blocalStorage\b/.test(codeOnly), '24. never references localStorage');

    const fromLines = fullSource.split('\n').filter((line) => line.trim().startsWith('} from ') || (line.trim().startsWith('import ') && line.includes(' from ')));
    assert(fromLines.length === 1 && fromLines[0].includes('DecentralizedWorldEncounterLeadResolution.js'), '25. exactly one import — 0.9.28\'s own DecentralizedWorldEncounterLeadResolution.js — no second resolution algorithm anywhere else');

    const forbiddenTerms = [
        'trusted', 'trust(', 'reputation', 'verified', 'verify(', 'authority', 'priority',
        'weight', 'confidence', 'ranking', 'scoring', 'nearest', 'proximity', 'winner',
        'preferred', 'dedup', 'reconcile', 'compare', '.find('
    ];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `26. code must never use "${term}" — no way to silently pick one candidate among several`);
    }

    console.log('✓ Architectural regression: no second resolution algorithm, no core/ import, no trust/ranking/picking vocabulary');
}

console.log('\nAll DecentralizedWorldEncounterLeadSelection tests passed.');
