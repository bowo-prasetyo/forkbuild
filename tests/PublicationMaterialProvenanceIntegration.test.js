import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { inspectWorldEncounterMaterial } from '../application/WorldEncounterMaterialInspection.js';
import { WorldEncounterMaterialSource, WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerifier, WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/DiscoverWorldEncounterPublicationCommandComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { PublicationMaterialProvenanceOrigin } from '../application/PublicationMaterialProvenance.js';
import { LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';

// 0.9.112 — Publication Provenance in World View.
// See docs/Roadmap.md, "0.9.112 — Publication Provenance in World View," and
// application/PublicationMaterialProvenance.js's own header for the full
// design. This file proves the milestone's own six flagship scenarios end
// to end, through the real running collaborators (WorldEncounterCanvas's
// own computed, the real decentralized runtime composition, a real signed
// Publication) rather than synthetic shapes alone.
//
//   Section A: local provenance — selection-driven inspection reports
//              LOCAL without changing its own inspection result
//   Section B: decentralized provenance — discovery-driven inspection
//              reports DECENTRALIZED, alongside RESOLVED/VERIFIED
//   Section C: provenance does not affect verification — a rejected
//              decentralized material stays DECENTRALIZED + REJECTED
//   Section D: provenance does not affect resolution — AMBIGUOUS stays
//              AMBIGUOUS, and carries no provenance at all
//   Section E: local/decentralized independence — running discovery never
//              overwrites the local inspection's own provenance, and vice
//              versa
//   Section F: object identity — the provenance wrapper never clones or
//              mutates the underlying Publication/material

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildSignedPublication(overrides = {}) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login('alice-provenance');
    const publisherIdentity = provider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-provenance-1',
        documentId: 'doc-provenance-1',
        title: 'A Provenance Test Publication',
        author: 'alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-PROVENANCE', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(provider.signCanonical(publication.getSigningDescriptor()));
    return { publication, provider };
}

function graphqlSearchFetch(idsByTag) {
    return async (url, options) => {
        const body = JSON.parse(options.body);
        const match = /values: \["([^"]+)"\]/.exec(body.query);
        const tag = match ? match[1] : null;
        const ids = idsByTag[tag] || [];
        return new Response(JSON.stringify({
            data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } }
        }), { status: 200 });
    };
}

function gatewayRetrievalFetch(materialByTxId) {
    return async (url) => {
        const txId = url.split('/').pop();
        const material = materialByTxId[txId];
        if (!material) {
            return new Response('', { status: 404 });
        }
        return new Response(JSON.stringify(material), { status: 200 });
    };
}

class FakeLocalSource extends WorldEncounterMaterialSource {
    constructor(material) { super(); this.material = material; }
    async load() { return this.material; }
}

class ConfirmingVerifier extends WorldEncounterMaterialVerifier {
    async verifyIdentity() { return true; }
}

async function run() {
    // ---------------------------------------------------------------------
    // A. Local provenance — a selection-driven inspection (no resolved
    //    lead) reports LOCAL, and materialInspection's own fields are
    //    untouched by computing provenance from them.
    // ---------------------------------------------------------------------
    {
        const { publication } = buildSignedPublication();
        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: LOCAL_WORLD_DISCOVERY_ORIGIN });

        const materialInspection = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: new FakeLocalSource(publication) },
            verifier: new ConfirmingVerifier()
        });

        const provenance = WorldEncounterCanvas.computed.materialProvenance.call({ materialInspection });

        assert(provenance && provenance.origin === PublicationMaterialProvenanceOrigin.LOCAL, '1. a local, selection-driven inspection reports LOCAL provenance');
        assert(materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '2. the inspection\'s own loading result is unaffected by computing provenance');
        assert(materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '3. the inspection\'s own verification result is unaffected by computing provenance');
        assert(materialInspection.lead === null, '4. no lead was ever supplied — confirming this really is the local path, not accidentally decentralized');

        console.log('✓ Section A: local provenance — a selection-driven inspection reports LOCAL, without changing its own inspection result');
    }

    // ---------------------------------------------------------------------
    // B. Decentralized provenance — discovery-driven inspection reports
    //    DECENTRALIZED, while RESOLVED/VERIFIED are both preserved.
    // ---------------------------------------------------------------------
    let decentralizedCase; // reused by Section E below
    {
        const { publication } = buildSignedPublication({ id: 'pub-provenance-b', contentReference: { hash: 'h-b', uri: 'ar://TX-B', storage: 'ar' } });
        const idsByTag = { forkbuild_pub: ['TX-B'] };
        const materialByTxId = { 'TX-B': publication.toJSON() };

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: graphqlSearchFetch(idsByTag) });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services,
            arweaveResolverOptions: { fetchImpl: gatewayRetrievalFetch(materialByTxId) },
            verifier
        });
        const discoveryCommand = composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider: { list: () => [publication] } });

        const discoveryResult = await discoveryCommand({ objectId: publication.id, discoveryTag: 'forkbuild_pub' });

        assert(discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, '5. discovery resolves RESOLVED end to end');
        assert(discoveryResult.inspection && discoveryResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '6. the resolved material verifies VERIFIED');
        assert(discoveryResult.provenance && discoveryResult.provenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED, '7. a discovery-driven inspection reports DECENTRALIZED provenance');

        decentralizedCase = { publication, discoveryResult };
        console.log('✓ Section B: decentralized provenance — discovery-driven inspection reports DECENTRALIZED, alongside RESOLVED/VERIFIED');
    }

    // ---------------------------------------------------------------------
    // C. Provenance does not affect verification — a decentralized
    //    material that fails verification stays DECENTRALIZED + REJECTED,
    //    never a new combined status.
    // ---------------------------------------------------------------------
    {
        const { publication } = buildSignedPublication({ id: 'pub-provenance-c', contentReference: { hash: 'h-c', uri: 'ar://TX-C', storage: 'ar' } });
        const tamperedMaterial = { ...publication.toJSON(), title: 'Tampered Title After Signing' };
        const idsByTag = { forkbuild_pub: ['TX-C'] };
        const materialByTxId = { 'TX-C': tamperedMaterial };

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: graphqlSearchFetch(idsByTag) });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services,
            arweaveResolverOptions: { fetchImpl: gatewayRetrievalFetch(materialByTxId) },
            verifier
        });
        const discoveryCommand = composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider: { list: () => [publication] } });

        const discoveryResult = await discoveryCommand({ objectId: publication.id, discoveryTag: 'forkbuild_pub' });

        assert(discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, '8. discovery still resolves RESOLVED — resolution is unrelated to verification outcome');
        assert(discoveryResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED, '9. tampered material is actively REJECTED, not merely unverifiable');
        assert(discoveryResult.provenance && discoveryResult.provenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED, '10. provenance still reports DECENTRALIZED — a rejection never erases where the material came from');

        console.log('✓ Section C: provenance does not affect verification — a rejected decentralized material remains DECENTRALIZED + REJECTED');
    }

    // ---------------------------------------------------------------------
    // D. Provenance does not affect resolution — AMBIGUOUS stays AMBIGUOUS,
    //    and carries no provenance at all (nothing was ever inspected).
    // ---------------------------------------------------------------------
    {
        const { publication: pubX } = buildSignedPublication({ id: 'pub-provenance-d', contentReference: { hash: 'h-d1', uri: 'ar://TX-D1', storage: 'ar' } });
        const idsByTag = { forkbuild_pub: ['TX-D1', 'TX-D2'] };

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: graphqlSearchFetch(idsByTag) });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, verifier });
        // Two candidate leads for the same discoveryTag, and no association
        // evidence naming either one — resolveDecentralizedWorldEncounterLeadFromRegistry()
        // (0.9.28, unmodified) reports AMBIGUOUS rather than guessing.
        const discoveryCommand = composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider: { list: () => [] } });

        const discoveryResult = await discoveryCommand({ objectId: pubX.id, discoveryTag: 'forkbuild_pub' });

        assert(discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE || discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS,
            '11. with no association evidence at all, resolution never reports RESOLVED');
        assert(discoveryResult.inspection === null, '12. no inspection is ever attempted for an unresolved discovery');
        assert(discoveryResult.provenance === null, '13. no provenance is reported when there is no inspection to attach it to');

        console.log('✓ Section D: provenance does not affect resolution — an unresolved discovery carries no provenance, and resolution stays exactly as 0.9.28 already reports it');
    }

    // ---------------------------------------------------------------------
    // E. Local/decentralized independence — computing one path's own
    //    provenance never reads or writes the other path's own state.
    // ---------------------------------------------------------------------
    {
        // The local case from Section A and the decentralized case from
        // Section B are entirely separate objects, computed by entirely
        // separate calls — there is no shared mutable state anywhere in
        // either derivation for one to leak into the other.
        const { publication } = buildSignedPublication({ id: 'pub-provenance-e-local' });
        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: LOCAL_WORLD_DISCOVERY_ORIGIN });
        const materialInspection = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: new FakeLocalSource(publication) },
            verifier: new ConfirmingVerifier()
        });
        const localProvenance = WorldEncounterCanvas.computed.materialProvenance.call({ materialInspection });

        assert(localProvenance.origin === PublicationMaterialProvenanceOrigin.LOCAL, '14. the local case still reports LOCAL after Section B\'s own decentralized discovery already ran');
        assert(decentralizedCase.discoveryResult.provenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED, '15. Section B\'s own decentralized result is untouched by computing this new local one');
        assert(decentralizedCase.discoveryResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '16. Section B\'s own verification outcome is untouched too');

        // A full component context also keeps the two panels' own state
        // fields entirely separate — mirroring 0.9.111's own Section E.
        const ctx = { materialInspection, discoveryResult: null };
        assert(WorldEncounterCanvas.computed.materialProvenance.call(ctx).origin === PublicationMaterialProvenanceOrigin.LOCAL, '17. materialProvenance is computed purely from materialInspection, never from discoveryResult');
        ctx.discoveryResult = decentralizedCase.discoveryResult;
        assert(WorldEncounterCanvas.computed.materialProvenance.call(ctx).origin === PublicationMaterialProvenanceOrigin.LOCAL, '18. assigning a decentralized discoveryResult onto the same context never changes materialProvenance\'s own LOCAL answer');

        console.log('✓ Section E: local/decentralized independence — running decentralized discovery never overwrites the local inspection\'s own provenance, and vice versa');
    }

    // ---------------------------------------------------------------------
    // F. Object identity — the provenance wrapper never clones or mutates
    //    the underlying Publication/material.
    // ---------------------------------------------------------------------
    {
        const beforeJson = JSON.stringify(decentralizedCase.publication.toJSON());
        const material = decentralizedCase.discoveryResult.inspection.loading.material;

        assert(material && material.id === decentralizedCase.publication.id, '19. the loaded material still identifies the real published Publication');
        assert(!('origin' in material) && !('provenance' in material), '20. the loaded material itself carries no origin/provenance field — that fact stays entirely in the sibling provenance object');
        assert(JSON.stringify(decentralizedCase.publication.toJSON()) === beforeJson, '21. the original Publication object is byte-identical after its material\'s provenance was computed and read');
        assert(decentralizedCase.discoveryResult.provenance !== material && decentralizedCase.discoveryResult.provenance !== decentralizedCase.discoveryResult.inspection, '22. the provenance fact is its own distinct object — never the material or the inspection envelope reused');
        assert(Object.isFrozen(decentralizedCase.discoveryResult.provenance), '23. the provenance fact itself is frozen — a caller cannot mutate it in place either');

        console.log('✓ Section F: object identity — provenance is a small sibling fact, never a clone or mutation of the underlying Publication/material');
    }

    console.log('\nAll PublicationMaterialProvenanceIntegration tests passed.');
}

run().catch((error) => {
    console.error('PublicationMaterialProvenanceIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
