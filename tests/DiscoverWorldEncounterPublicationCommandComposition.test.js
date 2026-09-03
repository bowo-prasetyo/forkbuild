import { readFile } from 'node:fs/promises';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/DiscoverWorldEncounterPublicationCommandComposition.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';

// 0.9.111 — World View Decentralized Publication Retrieval.
// See docs/Roadmap.md, "0.9.111 — World View Decentralized Publication
// Retrieval," for the full milestone story.
//
//   Section A: FLAGSHIP — a command composed with a real, composed
//              discovery runtime and a real discoveryProvider reaches
//              RESOLVED/VERIFIED end to end, from a call supplying nothing
//              but { objectId, discoveryTag } — exactly WorldEncounterCanvas's
//              own call shape
//   Section B: discoveryProvider.list() is read fresh on every call, never
//              cached at composition time
//   Section C: the two composition-root collaborators always win over
//              anything a caller's own request happens to carry
//   Section D: no discoveryProvider supplied — publications is simply empty
//   Section E: architectural regression

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

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function buildSignedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-composed-discovery-1',
        documentId: 'doc-1',
        title: 'A Composition-Configured Discovered Publication',
        author: 'alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-COMPOSED', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
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

function realRuntime({ idsByTag, materialByTxId }) {
    const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
        arweaveFetchImpl: graphqlSearchFetch(idsByTag)
    });
    const { verifier } = composeWorldEncounterMaterialVerifier();
    return composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
        discoveryServices: services,
        arweaveResolverOptions: { fetchImpl: gatewayRetrievalFetch(materialByTxId) },
        verifier
    });
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'composed-discovery-alice');
        const publication = buildSignedPublication(alice);

        const runtime = realRuntime({
            idsByTag: { 'forkbuild-composed-tag': ['TX-COMPOSED'] },
            materialByTxId: { 'TX-COMPOSED': publication.toJSON() }
        });
        const discoveryProvider = { list: () => [publication] };

        const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider });

        // The exact call shape WorldEncounterCanvas's own discoverPublication()
        // makes — nothing about the runtime or local evidence, ever.
        const result = await discoverWorldEncounterPublicationCommand({
            objectId: publication.id,
            discoveryTag: 'forkbuild-composed-tag'
        });

        assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '1. FLAGSHIP — real association evidence from the composed discoveryProvider resolves RESOLVED');
        assert(result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '2. FLAGSHIP — the real Arweave resolver actually retrieves the resolved lead\'s own material');
        assert(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '3. FLAGSHIP — the real composed verifier reports VERIFIED end to end');

        console.log('✓ Flagship: a command composed with a real runtime and a real discoveryProvider reaches RESOLVED/VERIFIED, from a call carrying nothing but { objectId, discoveryTag }');
    }

    // ---------------------------------------------------------------
    // Section B — discoveryProvider.list() is read fresh on every call.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const bob = buildRealSigner(storage, 'composed-discovery-bob');
        const publication = buildSignedPublication(bob, { id: 'pub-composed-discovery-b', contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-FRESH', storage: 'ar' } });

        const runtime = realRuntime({
            idsByTag: { 'forkbuild-fresh-tag': ['TX-FRESH'] },
            materialByTxId: { 'TX-FRESH': publication.toJSON() }
        });

        let currentPublications = [];
        const discoveryProvider = { list: () => currentPublications };
        const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider });

        const firstResult = await discoverWorldEncounterPublicationCommand({ objectId: publication.id, discoveryTag: 'forkbuild-fresh-tag' });
        assert(firstResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE,
            '4. with no local evidence yet, resolution honestly reports UNAVAILABLE even though the lead itself was discovered');

        // The Wanderer's own replica now stores this Publication locally —
        // discoveryProvider.list() must reflect that on the VERY NEXT call,
        // never a snapshot frozen at composition time.
        currentPublications = [publication];
        const secondResult = await discoverWorldEncounterPublicationCommand({ objectId: publication.id, discoveryTag: 'forkbuild-fresh-tag' });
        assert(secondResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '5. a later call sees the discoveryProvider\'s CURRENT list, not a stale one captured when the command was composed');

        console.log('✓ Section B: discoveryProvider.list() is read fresh on every call, never cached at composition time');
    }

    // ---------------------------------------------------------------
    // Section C — composition-root collaborators always win over a
    // caller's own request.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const carol = buildRealSigner(storage, 'composed-discovery-carol');
        const publication = buildSignedPublication(carol, { id: 'pub-composed-discovery-c', contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-DECOY-PROOF', storage: 'ar' } });

        const runtime = realRuntime({
            idsByTag: { 'forkbuild-decoy-tag': ['TX-DECOY-PROOF'] },
            materialByTxId: { 'TX-DECOY-PROOF': publication.toJSON() }
        });
        const discoveryProvider = { list: () => [publication] };
        const decoyRuntime = { discoverWorldEncounterPublication: () => { throw new Error('the decoy runtime must never be consulted'); } };

        const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider });

        const result = await discoverWorldEncounterPublicationCommand({
            objectId: publication.id,
            discoveryTag: 'forkbuild-decoy-tag',
            // A caller attempting to supply its own collaborators — both
            // must be ignored; the composed runtime/discoveryProvider win.
            runtime: decoyRuntime,
            publications: []
        });

        assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '6. the composition-root\'s own runtime/discoveryProvider are the ones actually used — a request-supplied runtime/publications is ignored entirely');

        console.log('✓ Section C: composition-root collaborators (runtime, discoveryProvider) always win over anything a caller\'s own request carries');
    }

    // ---------------------------------------------------------------
    // Section D — no discoveryProvider supplied.
    // ---------------------------------------------------------------
    {
        const runtime = realRuntime({ idsByTag: {}, materialByTxId: {} });
        const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({ runtime });

        const result = await discoverWorldEncounterPublicationCommand({ objectId: 'pub-nobody', discoveryTag: 'forkbuild-empty' });
        assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE,
            '7. with no discoveryProvider supplied, publications is simply an empty array — never a thrown error');

        console.log('✓ Section D: no discoveryProvider supplied — publications defaults to an empty array, never a thrown error');
    }

    // ---------------------------------------------------------------
    // Section E — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/DiscoverWorldEncounterPublicationCommandComposition.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("import { executeDiscoverWorldEncounterPublicationCommand } from './DiscoverWorldEncounterPublicationCommand.js';"),
            '8. imports exactly the existing 0.9.111 command — never a second implementation');
        assert(!/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition|new ArweaveGraphqlDiscoveryQueryService|new NostrDiscoveryQueryService|LocalDiscoveryProvider/.test(codeOnly),
            '9. never constructs a discovery runtime or a discovery provider itself — that stays entirely its own caller\'s (ui/main.js\'s) concern');
        assert(!codeOnly.includes("'../ui/") && !codeOnly.includes('"../ui/'), '10. no UI import of any kind');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '11. exports exactly one function');
        assert((codeOnly.match(/executeDiscoverWorldEncounterPublicationCommand\(/g) || []).length === 1, '12. calls executeDiscoverWorldEncounterPublicationCommand exactly once');

        console.log('✓ Section E: architectural regression — a pure composition seam, no re-implemented discovery logic, no UI import');
    }

    console.log('\n✅ All Discover World Encounter Publication Command Composition tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
