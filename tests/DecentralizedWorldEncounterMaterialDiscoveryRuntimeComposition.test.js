import { readFile } from 'node:fs/promises';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';

// 0.9.110 — Decentralized Material Retrieval Runtime Composition.
//
// The flagship suite for the missing composition-root wiring named by
// 0.9.102's own audit: "decentralized discovery/material infrastructure...
// sitting completely unreachable from anywhere outside its own test
// suites." Every scenario below drives the REAL, unmodified 0.9.24-through-
// 0.9.43 chain — a real ArweaveGraphqlDiscoveryQueryService, a real
// NostrDiscoveryQueryService, a real DecentralizedWorldDiscoveryLeadRegistry,
// a real DecentralizedWorldEncounterMaterialSource wired to a real
// ArweaveWorldEncounterMaterialResolver, real association-evidence
// derivation, real resolution, and the real, composed identity+signature
// verifier — never a stub standing in for any of the pipeline itself. Only
// the network boundary (fetch / a relay's own queryImpl) is faked, the
// identical, established technique this codebase's own discovery/resolver
// test suites already use.
//
//   Section A: Arweave-only — discovery, resolution, retrieval, and
//              signature verification all succeed end to end
//   Section B: Nostr-only — the identical path through the other substrate
//   Section C: neither service reports anything — honest UNAVAILABLE, never
//              a thrown error, never a guess
//   Section D: two independent leads both matching evidence — AMBIGUOUS is
//              preserved, never resolved down to one candidate
//   Section E: a resolved, retrieved material that was tampered with after
//              signing is actively REJECTED — never a false pass
//   Section F: architectural sweep — this composition never reimplements
//              loading/verification/resolution, and ui/main.js +
//              ui/views/WorldView.js wire it in without inventing a second
//              inspection pipeline or new trust vocabulary

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
        id: 'pub-decentralized-1',
        documentId: 'doc-1',
        title: 'A Publication Discovered Through Nostr/Arweave',
        author: 'alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX1', storage: 'ar' },
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

function nostrQueryImpl(envelopesByTag) {
    return async (relayUrl, filter) => {
        const tag = filter['#t'][0];
        const envelopes = envelopesByTag[tag] || [];
        return envelopes.map((envelope, index) => ({
            id: `event-${index}`,
            kind: 1,
            content: JSON.stringify(envelope)
        }));
    };
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — FLAGSHIP: Arweave-only, real end to end
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'discovery-alice-a');
        const publication = buildSignedPublication(alice);

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            arweaveFetchImpl: graphqlSearchFetch({ 'forkbuild-tag-a': ['TX1'] })
        });
        assert(services.nostr === null, '1. with no host queryImpl supplied, the Nostr service is gracefully omitted, never constructed');

        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services,
            arweaveResolverOptions: { fetchImpl: gatewayRetrievalFetch({ TX1: publication.toJSON() }) },
            verifier
        });

        const result = await runtime.discoverWorldEncounterPublication({
            objectId: publication.id,
            discoveryTag: 'forkbuild-tag-a',
            publications: [publication]
        });

        assert(result.discovery.arweave.length === 1, '2. the Arweave service reports exactly the one lead its own fake gateway carries');
        assert(result.discovery.nostr === undefined, '3. a service never configured is never queried and never appears in the discovery report');
        assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '4. real association evidence (this replica\'s own signed Publication, matching the discovered lead\'s own uri) resolves RESOLVED');
        assert(result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '5. the resolved lead\'s own material is actually retrieved through the real Arweave resolver');
        assert(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '6. the real composed verifier reports VERIFIED for the genuine signature carried all the way through');
        assert(Object.isFrozen(result) && Object.isFrozen(result.resolution) && Object.isFrozen(result.inspection),
            '7. the composed result and its nested resolution/inspection are frozen');

        console.log('✓ Section A: Arweave-only discovery/resolution/retrieval/verification succeeds end to end');
    }

    // -------------------------------------------------------------
    // Section B — Nostr-only, the other substrate
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const bob = buildRealSigner(storage, 'discovery-bob-b');
        const publication = buildSignedPublication(bob, {
            id: 'pub-decentralized-2',
            contentReference: { hash: 'placeholder-hash', uri: 'ipfs://cid-nostr-2', storage: 'ipfs' }
        });

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: nostrQueryImpl({
                'forkbuild-tag-b': [{ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'irrelevant-self-claim', uri: 'ipfs://cid-nostr-2' }]
            })
        });
        assert(services.arweave !== null, '8. Arweave\'s own service is always constructed — it works with no host capability at all');

        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: { nostr: services.nostr },
            local: null,
            verifier
        });
        // No decentralized retriever is configured for ipfs:// in this
        // milestone (Arweave-only, per DecentralizedWorldEncounterMaterialRuntimeComposition.js's
        // own header) — this section proves discovery and RESOLUTION work
        // through Nostr independently of Arweave; retrieval for a
        // non-Arweave uri honestly stays UNAVAILABLE, exactly as the
        // existing chain already documents.
        const result = await runtime.discoverWorldEncounterPublication({
            objectId: publication.id,
            discoveryTag: 'forkbuild-tag-b',
            publications: [publication]
        });

        assert(result.discovery.nostr.length === 1, '9. the Nostr service reports exactly the one lead its own fake relay carries');
        assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '10. Nostr discovery alone, with Arweave configured but reporting nothing for this tag, still resolves RESOLVED');
        assert(result.resolution.resolvedLead.origin.startsWith('dweb:nostr:'),
            '11. the resolved lead genuinely came from the Nostr service, never fabricated');
        assert(result.inspection.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE,
            '12. retrieval for a non-ar:// uri stays UNAVAILABLE — no second decentralized retriever exists yet, honestly reported');

        console.log('✓ Section B: Nostr-only discovery/resolution succeeds independently of Arweave');
    }

    // -------------------------------------------------------------
    // Section C — neither service reports anything
    // -------------------------------------------------------------
    {
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: nostrQueryImpl({}),
            arweaveFetchImpl: graphqlSearchFetch({})
        });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, verifier });

        const result = await runtime.discoverWorldEncounterPublication({
            objectId: 'pub-nobody-has-ever-heard-of',
            discoveryTag: 'forkbuild-tag-nothing',
            publications: []
        });

        assert(result.discovery.nostr.length === 0 && result.discovery.arweave.length === 0,
            '13. both configured services genuinely ran and both reported nothing');
        assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE,
            '14. with no leads and no evidence, resolution honestly reports UNAVAILABLE, never a thrown error');
        assert(result.inspection === null,
            '15. with nothing resolved, no material is ever loaded or verified — inspection stays null, never a guess');

        console.log('✓ Section C: neither service reporting anything degrades honestly to UNAVAILABLE');
    }

    // -------------------------------------------------------------
    // Section D — ambiguous discovery is preserved, never resolved down
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const carol = buildRealSigner(storage, 'discovery-carol-d');
        const publication = buildSignedPublication(carol, {
            id: 'pub-decentralized-ambiguous',
            contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-AMBIGUOUS', storage: 'ar' }
        });

        // Two independent discovery services both report a lead for the
        // SAME uri — 0.9.24's own header refuses to treat that as
        // corroboration; two independent leads, never merged into one.
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: nostrQueryImpl({
                'forkbuild-tag-d': [{ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'irrelevant', uri: 'ar://TX-AMBIGUOUS' }]
            }),
            arweaveFetchImpl: graphqlSearchFetch({ 'forkbuild-tag-d': ['TX-AMBIGUOUS'] })
        });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, verifier });

        const result = await runtime.discoverWorldEncounterPublication({
            objectId: publication.id,
            discoveryTag: 'forkbuild-tag-d',
            publications: [publication]
        });

        assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS,
            '16. two independently-reported leads for the same uri resolve AMBIGUOUS, never merged into one');
        assert(result.resolution.candidates.length === 2,
            '17. both candidates are preserved — this composition never picks a "best" one');
        assert(result.inspection === null,
            '18. an AMBIGUOUS resolution never triggers a guessed retrieval — inspection stays null');

        console.log('✓ Section D: ambiguous discovery preserves both candidates, never guesses one');
    }

    // -------------------------------------------------------------
    // Section E — retrieved material that was tampered with is REJECTED
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const dave = buildRealSigner(storage, 'discovery-dave-e');
        const publication = buildSignedPublication(dave, {
            id: 'pub-decentralized-tampered',
            contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-TAMPERED', storage: 'ar' }
        });

        const tamperedMaterial = { ...publication.toJSON(), title: 'A Different Title Entirely' };

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            arweaveFetchImpl: graphqlSearchFetch({ 'forkbuild-tag-e': ['TX-TAMPERED'] })
        });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services,
            arweaveResolverOptions: { fetchImpl: gatewayRetrievalFetch({ 'TX-TAMPERED': tamperedMaterial }) },
            verifier
        });

        const result = await runtime.discoverWorldEncounterPublication({
            objectId: publication.id,
            discoveryTag: 'forkbuild-tag-e',
            publications: [publication]
        });

        assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '19. the association evidence still resolves RESOLVED — retrieval and verification are separate questions');
        assert(result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '20. the tampered material still LOADS — retrieval never judges content');
        assert(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '21. content tampered with after signing is actively REJECTED by the real signature verifier, never a false pass');

        console.log('✓ Section E: material tampered with after signing is actively rejected through the real decentralized path');
    }

    // -------------------------------------------------------------
    // Section F — architectural sweep
    // -------------------------------------------------------------
    {
        const compositionUrl = new URL('../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js', import.meta.url);
        const compositionSource = await readFile(compositionUrl, 'utf8');
        const compositionCodeOnly = compositionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(compositionCodeOnly.includes("import { inspectWorldEncounterMaterial } from './WorldEncounterMaterialInspection.js';"),
            '22. the composition imports the existing, unmodified inspectWorldEncounterMaterial() — never a second inspection algorithm');
        assert(/import\s*\{\s*resolveDecentralizedWorldEncounterLeadFromRegistry/.test(compositionCodeOnly),
            '23. the composition imports the existing, unmodified resolution boundary — never re-implementing UNAVAILABLE/RESOLVED/AMBIGUOUS itself');
        assert(compositionCodeOnly.includes("import { queryDecentralizedWorldDiscoveryIntoRegistry } from './DecentralizedWorldDiscoveryQueryRegistryBridge.js';"),
            '24. the composition imports the existing, unmodified query→registry bridge — never writing its own registry.setLead() loop from scratch');
        assert(!/verifyIdentity\s*\(|\.signature\s*===|Ed25519|verifyPublication\s*\(/.test(compositionCodeOnly),
            '25. the composition never reads a signature or calls a cryptographic verifier itself — that stays entirely inside the injected verifier');
        assert(!/TRUSTED|UNTRUSTED|\bSAFE\b|UNSAFE|AUTHENTIC|SUSPICIOUS|\bRANK\b|\bSCORE\b|PREFERRED/i.test(compositionCodeOnly),
            '26. the composition introduces no trust/ranking vocabulary of its own');

        const mainUrl = new URL('../ui/main.js', import.meta.url);
        const mainSource = await readFile(mainUrl, 'utf8');
        const mainCodeOnly = mainSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(/from '\.\.\/application\/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition\.js';/.test(mainCodeOnly)
            && mainCodeOnly.includes('composeDecentralizedWorldEncounterMaterialDiscoveryServices(')
            && mainCodeOnly.includes('composeDecentralizedWorldEncounterMaterialDiscoveryRuntime('),
            '27. ui/main.js imports and actually calls the new composition root');
        assert(mainCodeOnly.includes("app.provide('worldDiscoveryLeadRegistry'"),
            '28. ui/main.js provides worldDiscoveryLeadRegistry app-wide for the first time — the registry WorldEncounterCanvas has been able to accept since 0.9.40');
        assert(mainCodeOnly.includes('decentralizedWorldEncounterMaterialDiscoveryRuntime.materialSources')
            && !/worldEncounterMaterialSources\s*=\s*Object\.freeze\(\{/.test(mainCodeOnly),
            "29. ui/main.js reads worldEncounterMaterialSources (including its new .decentralized slot) straight off the composition root's own materialSources — never a second object literal shaping it by hand");

        const viewUrl = new URL('../ui/views/WorldView.js', import.meta.url);
        const viewSource = await readFile(viewUrl, 'utf8');
        const viewCodeOnly = viewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(viewCodeOnly.includes("inject('worldDiscoveryLeadRegistry', null)"),
            '30. WorldView.js injects worldDiscoveryLeadRegistry, defaulting to null — never throwing when absent');
        assert(/<WorldEncounterCanvas[\s\S]{0,600}:worldDiscoveryLeadRegistry="worldDiscoveryLeadRegistry"/.test(viewCodeOnly),
            '31. WorldView.js forwards worldDiscoveryLeadRegistry to WorldEncounterCanvas\'s own pre-existing (0.9.40) prop — no new inspection UI');
        assert(!/inspectWorldEncounterMaterial|verifyWorldEncounterMaterial|verifyIdentity\(/.test(viewCodeOnly.replace(/discoverWorldEncounterPublicationCommand[\s\S]{0,40}/g, '')),
            '32. WorldView.js never calls the inspection/verification chain itself outside the one injected command it forwards');

        console.log('✓ Section F: the composition reuses the existing pipeline verbatim, and ui/main.js + WorldView.js wire it in without a second inspection UI');
    }

    console.log('✅ All Decentralized World Encounter Material Discovery Runtime Composition tests passed.');
}

await runTests();
