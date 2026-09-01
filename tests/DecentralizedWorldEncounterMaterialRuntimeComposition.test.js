import { readFile } from 'node:fs/promises';
import {
    composeArweaveDecentralizedWorldEncounterMaterialSource,
    composeWorldEncounterMaterialSources
} from '../application/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import {
    loadWorldEncounterMaterial,
    WorldEncounterMaterialLoadStatus
} from '../application/WorldEncounterMaterialLoading.js';
import { loadWorldEncounterMaterialFromResolvedLead } from '../application/DecentralizedWorldEncounterLeadAwareMaterialLoading.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';
import { resolveDecentralizedWorldEncounterLeadFromRegistry, DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes } from '../application/DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js';
import { parseDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.36 — Decentralized World Encounter Material Runtime Composition.
// See docs/Roadmap.md, "0.9.36 — Decentralized World Encounter Material Runtime Composition."
//
//   Section A: composeArweaveDecentralizedWorldEncounterMaterialSource() builds a
//              working { resolver, decentralized } pair
//   Section B: resolverOptions are forwarded verbatim to the Arweave resolver
//   Section C: a construction failure propagates, never swallowed
//   Section D: composeWorldEncounterMaterialSources() forwards local/peer verbatim
//              and fills in a fresh decentralized slot
//   Section E: two composition calls build two independent instances — no
//              module-level state, no singleton, no caching
//   Section F: the unmodified 0.9.21 loader still never routes to `.decentralized`
//              on its own, even once composed
//   Section G: FLAGSHIP — Nostr discovery, Arweave retrieval: a Nostr event
//              carrying a discovery envelope resolves a lead whose own uri a
//              composed decentralized material source then retrieves from a
//              mocked Arweave gateway, with discovery provenance (origin) and
//              material provenance (uri) staying two distinct fields all the
//              way through
//   Section H: architectural regression — no discovery/lead/resolution
//              imports in the composition file itself, no fetch()/WebSocket
//              of its own, no trust vocabulary, and 0.9.21/0.9.34 are never
//              modified

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function makeFakeGateway({ handler }) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return handler(url, options);
    }
    return { requests, fetchImpl };
}

function gatewayResponse(body, { status = 200, headers = {} } = {}) {
    return new Response(body, { status, headers });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — composeArweaveDecentralizedWorldEncounterMaterialSource()
    // builds a working { resolver, decentralized } pair.
    // ---------------------------------------------------------------
    {
        const material = { id: 'pub-1', title: 'A Decentralized Publication' };
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify(material)) });

        const { resolver, decentralized } = composeArweaveDecentralizedWorldEncounterMaterialSource({ fetchImpl: gateway.fetchImpl });
        assert(resolver instanceof ArweaveWorldEncounterMaterialResolver, '1. a real ArweaveWorldEncounterMaterialResolver is constructed');
        assert(typeof decentralized.load === 'function', '2. the returned decentralized source exposes load()');

        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'local' });
        const resolvedLead = Object.freeze({ origin: 'nostr:wss://relay.example', discoveryTag: 'forkbuild', uri: 'ar://tx-abc123', storage: 'ar' });

        const loaded = await decentralized.load(resolvedSelection, resolvedLead);
        assert(loaded !== null && loaded.id === 'pub-1', '3. FLAGSHIP (unit level) — the composed source actually retrieves material through the composed resolver');
        assert(gateway.requests.length === 1 && gateway.requests[0].url.endsWith('/tx-abc123'), '4. the underlying gateway request names the resolved lead\'s own transaction id');
    }
    console.log('✓ Section A: composeArweaveDecentralizedWorldEncounterMaterialSource() builds a working, real pair');

    // ---------------------------------------------------------------
    // Section B — resolverOptions are forwarded verbatim to the Arweave
    // resolver's own constructor.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ ok: true })) });
        const { resolver } = composeArweaveDecentralizedWorldEncounterMaterialSource({
            fetchImpl: gateway.fetchImpl,
            gatewayUrl: 'https://custom-gateway.example',
            maxResponseBytes: 10
        });
        assert(resolver.gatewayUrl === 'https://custom-gateway.example', '5. a custom gatewayUrl is forwarded to the resolver');

        const result = await resolver.retrieveByUri('ar://tx-abc123');
        assert(result === null, '6. a custom maxResponseBytes is forwarded and enforced (a {"ok":true} body exceeds a 10-byte ceiling)');
        assert(gateway.requests[0].url === 'https://custom-gateway.example/tx-abc123', '7. the custom gatewayUrl is actually the one used for the request');
    }
    console.log('✓ Section B: resolverOptions forwarded verbatim to the Arweave resolver\'s own constructor');

    // ---------------------------------------------------------------
    // Section C — a construction failure propagates, never swallowed.
    // ---------------------------------------------------------------
    {
        const originalFetch = globalThis.fetch;
        delete globalThis.fetch;
        try {
            expectThrows(() => composeArweaveDecentralizedWorldEncounterMaterialSource({ fetchImpl: null }),
                '8. no fetchImpl and no global fetch throws at composition time, not later on first retrieval');
            expectThrows(() => composeArweaveDecentralizedWorldEncounterMaterialSource({ gatewayUrl: '', fetchImpl: async () => {} }),
                '9. an empty gatewayUrl throws at composition time');
        } finally {
            globalThis.fetch = originalFetch;
        }
    }
    console.log('✓ Section C: a resolver construction failure propagates rather than being swallowed');

    // ---------------------------------------------------------------
    // Section D — composeWorldEncounterMaterialSources() forwards
    // local/peer verbatim and fills in a fresh decentralized slot.
    // ---------------------------------------------------------------
    {
        const localSource = { load: async () => ({ marker: 'local' }) };
        const peerSource = { load: async () => ({ marker: 'peer' }) };
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ marker: 'decentralized' })) });

        const materialSources = composeWorldEncounterMaterialSources({
            local: localSource,
            peer: peerSource,
            arweaveResolverOptions: { fetchImpl: gateway.fetchImpl }
        });

        assert(materialSources.local === localSource, '10. local is forwarded by reference, unmodified');
        assert(materialSources.peer === peerSource, '11. peer is forwarded by reference, unmodified');
        assert(materialSources.decentralized && typeof materialSources.decentralized.load === 'function', '12. decentralized is a fresh, working source');

        const localResult = await loadWorldEncounterMaterial({
            resolvedSelection: { kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'local' },
            materialSources
        });
        assert(localResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE && localResult.material.marker === 'local', '13. the composed materialSources still loads local material through the unmodified 0.9.21 boundary');

        const peerResult = await loadWorldEncounterMaterial({
            resolvedSelection: { kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'peer:did:key:z6MkExamplePeer' },
            materialSources
        });
        assert(peerResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE && peerResult.material.marker === 'peer', '14. the composed materialSources still loads peer material through the unmodified 0.9.21 boundary');
    }
    console.log('✓ Section D: composeWorldEncounterMaterialSources() forwards local/peer verbatim, fills decentralized');

    // ---------------------------------------------------------------
    // Section E — two composition calls build two independent
    // instances; no module-level state, no singleton.
    // ---------------------------------------------------------------
    {
        const gatewayA = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ from: 'A' })) });
        const gatewayB = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ from: 'B' })) });

        const a = composeArweaveDecentralizedWorldEncounterMaterialSource({ fetchImpl: gatewayA.fetchImpl });
        const b = composeArweaveDecentralizedWorldEncounterMaterialSource({ fetchImpl: gatewayB.fetchImpl });

        assert(a.resolver !== b.resolver && a.decentralized !== b.decentralized, '15. two composition calls never share a resolver or source instance');

        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'local' });
        const resolvedLead = Object.freeze({ origin: 'nostr', discoveryTag: 'forkbuild', uri: 'ar://tx-1' });
        const materialA = await a.decentralized.load(resolvedSelection, resolvedLead);
        const materialB = await b.decentralized.load(resolvedSelection, resolvedLead);
        assert(materialA.from === 'A' && materialB.from === 'B', '16. each composed pair only ever talks to its own injected gateway');
        assert(gatewayA.requests.length === 1 && gatewayB.requests.length === 1, '17. no cross-talk between independently composed pairs');
    }
    console.log('✓ Section E: every composition call builds a fresh, independent pair');

    // ---------------------------------------------------------------
    // Section F — the unmodified 0.9.21 loader still never routes to
    // `.decentralized` on its own, even once composed.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify({ id: 'pub-1' })) });
        const materialSources = composeWorldEncounterMaterialSources({ arweaveResolverOptions: { fetchImpl: gateway.fetchImpl } });

        const result = await loadWorldEncounterMaterial({
            resolvedSelection: { kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'nostr:wss://relay.example' },
            materialSources
        });
        assert(result.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '18. loadWorldEncounterMaterial() still has no decentralized origin family and never reaches .decentralized on its own');
        assert(gateway.requests.length === 0, '19. the composed Arweave gateway is never contacted through the unmodified 0.9.21 boundary');
    }
    console.log('✓ Section F: 0.9.21\'s own loader still never routes to a composed decentralized source on its own');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: the same object discovered via Nostr,
    // retrieved via Arweave, through the full, real chain, with no
    // step replaced by a stand-in except the network edges (the Nostr
    // relay and the Arweave gateway).
    // ---------------------------------------------------------------
    {
        // 1. A Nostr relay event, exactly the shape application/
        //    NostrDiscoveryQueryService.js's own header describes: a cheap
        //    "t" discovery tag for relay-side filtering, and a ForkBuild
        //    discovery envelope, as JSON, in the event's own `content`.
        const transactionId = 'ArweaveTxIdRepresentingAPublication123';
        const nostrEvent = {
            id: 'nostr-event-1',
            kind: 1,
            tags: [['t', 'forkbuild']],
            content: JSON.stringify({
                protocol: 'forkbuild',
                version: 1,
                kind: WorldEncounterKind.PUBLICATION,
                objectId: 'pub-decentralized-1',
                uri: `ar://${transactionId}`
            })
        };

        // 2. The envelope the event's own content declares — parsed via
        //    core/DecentralizedDiscoveryEnvelope.js (0.9.30, unmodified).
        //    This is a self-declared CLAIM, not yet evidence — see that
        //    file's own header.
        const envelope = parseDecentralizedDiscoveryEnvelope(nostrEvent.content);
        assert(envelope !== null, '20. the Nostr event\'s own content parses as a well-formed discovery envelope');

        // 3. A lead a Nostr adapter's own search() would have reported for
        //    the "forkbuild" discovery tag — origin names the DISCOVERY
        //    SERVICE (a specific relay), never the retrieval uri. Registered
        //    into a real DecentralizedWorldDiscoveryLeadRegistry (0.9.26,
        //    unmodified).
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        registry.setLead(Object.freeze({
            origin: 'nostr:wss://relay.example',
            discoveryTag: 'forkbuild',
            uri: `ar://${transactionId}`,
            storage: 'ar'
        }));

        // 4. The envelope becomes association evidence only by explicitly
        //    matching a currently-known lead's own uri — application/
        //    DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js
        //    (0.9.32, unmodified). Neither the discovery tag nor the uri
        //    alone was evidence; this step is what turns a claim into one.
        const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
            envelopes: [envelope],
            leads: registry.listLeads()
        });
        assert(associations.length === 1, '21. the envelope\'s declared uri matches exactly the one registered lead, producing one association');

        // 5. Resolution — application/DecentralizedWorldEncounterLeadResolution.js
        //    (0.9.28, unmodified). requestedMaterial names WHAT is wanted;
        //    resolution decides WHICH currently-known lead, if any, the
        //    supplied evidence connects it to.
        const resolution = resolveDecentralizedWorldEncounterLeadFromRegistry({
            requestedMaterial: { kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-decentralized-1' },
            registry,
            associations
        });
        assert(resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, '22. exactly one currently-known lead resolves for the requested material');
        const resolvedLead = resolution.resolvedLead;
        assert(resolvedLead.origin === 'nostr:wss://relay.example', '23. the resolved lead\'s own origin still names the discovery service, not a retrieval address');
        assert(resolvedLead.uri === `ar://${transactionId}`, '24. the resolved lead\'s own uri is the retrieval address');

        // 6. A resolved selection for the very same PUBLICATION/objectId —
        //    origin here is a WorldEncounterKind selection-identity origin
        //    (0.9.19), a fact about how the encounter is being viewed,
        //    entirely unrelated to resolvedLead.origin's own discovery-
        //    service identity. Kept deliberately different from
        //    resolvedLead.origin to prove the two never collapse.
        const resolvedSelection = Object.freeze({
            kind: WorldEncounterKind.PUBLICATION,
            objectId: 'pub-decentralized-1',
            origin: 'local'
        });

        // 7. Runtime composition — THIS milestone. A real Arweave gateway
        //    resolver, wired into a real decentralized material source,
        //    with only the network edge itself (fetchImpl) mocked.
        const publication = { id: 'pub-decentralized-1', title: 'Discovered via Nostr, Retrieved via Arweave', body: 'The flagship chain.' };
        const gateway = makeFakeGateway({
            handler: (url) => {
                assert(url === `https://arweave.net/${transactionId}`, '25. the gateway request names exactly the resolved lead\'s own transaction id, on the default gateway');
                return gatewayResponse(JSON.stringify(publication));
            }
        });
        const materialSources = composeWorldEncounterMaterialSources({ arweaveResolverOptions: { fetchImpl: gateway.fetchImpl } });

        // 8. Loading — application/DecentralizedWorldEncounterLeadAwareMaterialLoading.js
        //    (0.9.34, unmodified), fed this milestone's own composed
        //    materialSources.decentralized.
        const result = await loadWorldEncounterMaterialFromResolvedLead({
            resolvedSelection,
            resolvedLead,
            materialSources
        });

        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '26. FLAGSHIP — the full Nostr-discovery-to-Arweave-retrieval chain resolves to AVAILABLE material');
        assert(result.material.id === 'pub-decentralized-1' && result.material.title === 'Discovered via Nostr, Retrieved via Arweave', '27. FLAGSHIP — the retrieved material is exactly what the mocked Arweave gateway served');
        assert(result.resolvedSelection === resolvedSelection, '28. FLAGSHIP — resolvedSelection is forwarded by reference, unchanged');
        assert(result.resolvedLead === resolvedLead, '29. FLAGSHIP — resolvedLead is forwarded by reference, unchanged');
        assert(result.resolvedSelection.origin === 'local' && result.resolvedLead.origin === 'nostr:wss://relay.example', '30. FLAGSHIP — discovery provenance (resolvedLead.origin) and the selection\'s own origin stay two distinct facts, never merged');
        assert(result.resolvedLead.uri === `ar://${transactionId}`, '31. FLAGSHIP — material provenance (uri) is the Arweave address, entirely separate from either origin field');
        assert(gateway.requests.length === 1, '32. FLAGSHIP — exactly one Arweave gateway request served the whole chain');
    }
    console.log('✓ Section G: FLAGSHIP — Nostr event → envelope → lead → association → resolution → resolvedLead → composed Arweave retrieval → Publication, with discovery and material provenance staying distinct throughout');

    // ---------------------------------------------------------------
    // Section H — architectural regression.
    // ---------------------------------------------------------------
    {
        const path = '../application/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
        const fullSource = await readFile(new URL(path, import.meta.url), 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('DecentralizedWorldEncounterLeadResolution'), '33. never imports the 0.9.28 lead resolution boundary');
        assert(!codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry'), '34. never imports the 0.9.26 lead registry');
        assert(!codeOnly.includes('DecentralizedWorldEncounterLeadAssociation'), '35. never imports any lead-association module');
        assert(!codeOnly.includes('DecentralizedDiscoveryEnvelope'), '36. never imports the discovery envelope module');
        assert(!codeOnly.includes('DecentralizedWorldDiscoveryQuery'), '37. never imports the discovery query boundary');
        assert(!codeOnly.includes('NostrDiscoveryQueryService'), '38. never imports the Nostr adapter');
        assert(!codeOnly.includes('LocalWorldEncounterMaterialSource') && !codeOnly.includes('PeerWorldEncounterMaterialSource'), '39. never constructs a local or peer material source itself');
        assert(!/\bfetch\(/.test(codeOnly), '40. never calls fetch(...) directly — this file constructs, it never retrieves');
        assert(!codeOnly.includes('WebSocket'), '41. never references WebSocket');
        assert(!codeOnly.includes('async '), '42. contains no async function of its own — composition only, never retrieval');

        const forbiddenTerms = ['trusted', 'trust(', 'reputation', 'verify(', 'authority', 'weight', 'confidence', 'ranking', 'scoring'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `43. code must never use "${term}" — composition only, no trust/verification vocabulary`);
        }

        const loadingBoundarySource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
        assert(!loadingBoundarySource.includes('DecentralizedWorldEncounterMaterialRuntimeComposition'), '44. the 0.9.21 loading boundary itself is never modified to know about this composition file');

        const leadAwareBoundarySource = await readFile(new URL('../application/DecentralizedWorldEncounterLeadAwareMaterialLoading.js', import.meta.url), 'utf8');
        assert(!leadAwareBoundarySource.includes('DecentralizedWorldEncounterMaterialRuntimeComposition'), '45. the 0.9.34 lead-aware loading boundary itself is never modified to know about this composition file');
        assert(typeof loadWorldEncounterMaterialFromResolvedLead === 'function', '46. 0.9.34\'s own entry point is still directly importable, unmodified');

        console.log('✓ Section H: architectural regression — no discovery/lead/resolution imports, no fetch/WebSocket, no trust vocabulary; 0.9.21 and 0.9.34 boundaries untouched');
    }

    console.log('All DecentralizedWorldEncounterMaterialRuntimeComposition tests passed.');
}

await run();
