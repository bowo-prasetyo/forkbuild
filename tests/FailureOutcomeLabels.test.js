import { AnchorVerificationOutcome } from '../application/anchoring/AnchorVerificationOutcome.js';
import { describeVerificationOutcome } from '../application/publication/evidence/PublicationEvidenceView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { describePublicationOutcome } from '../application/publication/PublicationResolutionView.js';
import { ArweaveGatewayFailoverWorldEncounterMaterialResolver } from '../application/worldEncounter/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js';
import { assert } from './support/Assert.js';

// Failures from different layers stay distinguishable to the user, and
// gateway failover stays within one substrate. Moved here from a
// point-in-time audit so the behavior keeps a test of its own.

// Resolution and anchor-verification failures each get their own label,
// and none of them reads as success.
{
    const labels = [
        describePublicationOutcome(PublicationResolutionOutcome.CONTENT_UNAVAILABLE),
        describePublicationOutcome(PublicationResolutionOutcome.CONTENT_HASH_MISMATCH),
        describeVerificationOutcome(AnchorVerificationOutcome.PROOF_UNAVAILABLE),
        describeVerificationOutcome(AnchorVerificationOutcome.INVALID_PROOF)
    ];
    assert(new Set(labels).size === 4, `four different failures render four distinct labels (found ${JSON.stringify(labels)})`);
    assert(!labels.some((label) => /\b(success|verified|valid)\b/i.test(label)),
        `no failure label reads as success, verified or valid (found ${JSON.stringify(labels)})`);
    console.log('✓ failure outcomes render distinct, non-success labels');
}

// Every resolution outcome has its own label, and only RESOLVED reads as
// available; an unknown outcome is named as unsupported, never as success.
{
    const outcomes = Object.values(PublicationResolutionOutcome);
    const labels = outcomes.map((outcome) => describePublicationOutcome(outcome));
    assert(new Set(labels).size === outcomes.length, `each of the ${outcomes.length} resolution outcomes has a distinct label (found ${JSON.stringify(labels)})`);
    assert(describePublicationOutcome(PublicationResolutionOutcome.RESOLVED) === 'Available', 'a resolved publication reads as available');
    assert(labels.filter((label) => label === 'Available').length === 1, 'no other outcome reads as available');
    assert(describePublicationOutcome('SOMETHING_NEW') === 'Unsupported publication kind', 'an unknown outcome is named as unsupported');
    console.log('✓ every resolution outcome has its own label');
}

// Arweave gateway failover needs an explicit gateway list and resolves
// only Arweave content.
{
    for (const gatewayUrls of [undefined, []]) {
        let threw = false;
        try {
            new ArweaveGatewayFailoverWorldEncounterMaterialResolver({ gatewayUrls });
        } catch (error) {
            threw = /non-empty gatewayUrls array is required/.test(error.message);
        }
        assert(threw, `failover without gateways is rejected (gatewayUrls: ${JSON.stringify(gatewayUrls)})`);
    }
    const resolver = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({
        gatewayUrls: ['https://gateway-a.example', 'https://gateway-b.example'],
        fetchImpl: async () => { throw new Error('unused'); }
    });
    assert(resolver.storage === 'ar', `the failover resolver serves Arweave content only (storage: ${resolver.storage})`);
    console.log('✓ Arweave gateway failover requires explicit gateways and stays on Arweave');
}

console.log('\n✅ All FailureOutcomeLabels tests passed.');
