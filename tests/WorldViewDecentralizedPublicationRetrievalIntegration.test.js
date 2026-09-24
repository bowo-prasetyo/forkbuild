import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/worldEncounter/DiscoverWorldEncounterPublicationCommandComposition.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { worldEncounterCanvasFiles, mainFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.111 — World View Decentralized Publication Retrieval.
//
// 0.9.110 wired the decentralized discovery/retrieval pipeline into
// application composition, but `ui/views/WorldView.js` rendered its own
// result with ad-hoc "Resolution: …" / "Loading: …" text — a second,
// bespoke inspection representation living outside `WorldEncounterCanvas`'s
// own existing (0.9.39) Material/Verification panel. This milestone turns
// that reachability into an actual product capability: `WorldEncounterCanvas`
// now owns a `discoveryCommand` prop, a `discoverPublication()` action, and
// a "Discover Publication" panel that renders the resolved result through
// the EXACT SAME Material/Verification `<dl>` markup the selection-driven
// panel already uses — no second representation, no new trust vocabulary.
//
//   Section A: FLAGSHIP — a real composed command (real discovery runtime,
//              real verifier, fake Arweave network boundary) reaches
//              RESOLVED/VERIFIED end to end from one click, rendered
//              through the existing inspection shape
//   Section B: no discovery — UNAVAILABLE remains UNAVAILABLE, and
//              discoveryResult.inspection stays null
//   Section C: AMBIGUOUS discovery never produces an inspection object
//   Section D: a resolved lead whose material fails verification remains
//              REJECTED — discovery is not verification
//   Section E: local/decentralized separation — a discovery result never
//              overwrites or masquerades as selectedEncounter/materialInspection
//   Section F: no duplicate fetching — discoveryCommand is called exactly
//              once per click
//   Section G: no discoveryCommand supplied — the panel renders nothing and
//              stays entirely inert
//   Section H: repeated clicks never start a second, overlapping call, and
//              a stale in-flight response is discarded
//   Section I: architectural regression — WorldEncounterCanvas.js
//   Section J: architectural regression — WorldView.js
//   Section K: architectural regression — ui/main.js
//
// UPDATE (0.9.515): fixture fix, not a behavior change. 0.9.494 amended
// `application/arweave/ArweaveGraphqlDiscoveryQueryService.js#search()` to perform
// one additional gateway fetch per discovered transaction — decoding it as
// a real `core/DecentralizedDiscoveryEnvelope.js` envelope and reporting
// THAT envelope's own claimed `uri`, never the announcement transaction's
// own id, as a candidate's `uri` (see that file's own header). This
// file's own fake Arweave network boundary (`graphqlSearchFetch()` +
// `gatewayRetrievalFetch()`) was built before that change and never
// updated: it served a discovered transaction id's own gateway response
// as the MATERIAL directly, the exact one-fetch shape 0.9.494 replaced.
// Every section that discovers real Arweave-origin material through
// `realDiscoveryCommand()` (A, D, E) has been silently asserting against
// a contract this codebase stopped shipping — found by 0.9.515's own live
// re-execution of every flagship this journey depends on, not by reading
// this file's own prose. `tests/ArweaveDiscoveryUriIdentityBoundaryAudit
// .test.js`'s own `makeFakeArweaveSubstrate()` fixture (0.9.494's own
// convergence proof) is reused here verbatim, alongside the real,
// production `ArweaveAnnouncementPublisher` and
// `describeDecentralizedDiscoveryEnvelope()` this file now imports, rather
// than a second, competing fake network implementation. No production
// file changes; no assertion's own meaning changes — every section still
// proves exactly what its own name says.

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function buildSignedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-view-discovery-1',
        documentId: 'doc-1',
        title: 'A Publication Discovered From World View',
        author: 'alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-VIEW', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// A fake Arweave network — GraphQL search AND raw gateway retrieval over
// ONE shared ledger, exactly the real `arweave.net` topology. Copied
// verbatim from tests/ArweaveDiscoveryUriIdentityBoundaryAudit.test.js
// (0.9.494's own convergence proof for the envelope-aware contract this
// file's discovery now depends on) rather than re-derived here — see this
// file's own "UPDATE (0.9.515)" header note.
function makeFakeArweaveSubstrate() {
    const ledger = new Map(); // id -> { data, tag: { name, value } | null }
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }

    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';

        if (method === 'POST' && parsed.pathname === '/graphql') {
            const { query } = JSON.parse(options.body);
            const match = query.match(/name:\s*"([^"]*)"\s*,\s*values:\s*\[\s*"([^"]*)"\s*\]/);
            const edges = [];
            if (match) {
                const [, matchTagName, matchValue] = match;
                for (const [id, entry] of ledger.entries()) {
                    if (entry.tag && entry.tag.name === matchTagName && entry.tag.value === matchValue) {
                        edges.push({ node: { id } });
                    }
                }
            }
            return new Response(JSON.stringify({ data: { transactions: { edges } } }), { status: 200 });
        }

        const getMatch = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
        if (method === 'GET' && getMatch && ledger.has(getMatch[1])) {
            return new Response(ledger.get(getMatch[1]).data, { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    async function uploadTaggedTransaction(material, tag) {
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }

    function putContent(id, data) {
        ledger.set(id, { data, tag: null });
    }

    return { ledger, fetchImpl, uploadTaggedTransaction, putContent };
}

// Publishes a real `DecentralizedDiscoveryEnvelope` (0.9.30, unmodified)
// under `tag`, through the real `ArweaveAnnouncementPublisher` (0.9.494's
// own precedent), pointing at `materialTxId` — a SEPARATE ledger entry
// this function also populates with the actual material — rather than the
// pre-0.9.494 shape where the discovered transaction id WAS the material.
// `materialTxId` MUST be the id embedded in `publication.contentReference
// .uri` (the id every section below already fixed on) — association
// evidence (0.9.29, unmodified) matches a discovered candidate's own uri
// against a LOCALLY KNOWN publication's own `contentReference.uri`, so the
// two have to name the same location for resolution to reach RESOLVED.
async function announceArweaveMaterial(net, { tag, objectId, materialTxId, material }) {
    net.putContent(materialTxId, JSON.stringify(material));
    const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: tag, uploadTaggedTransaction: net.uploadTaggedTransaction });
    const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId, uri: `ar://${materialTxId}` });
    const announced = await publisher.publish(envelope);
    if (!announced || announced.published !== true) {
        throw new Error('announceArweaveMaterial: the fake ArweaveAnnouncementPublisher failed to publish — fixture is broken');
    }
}

function realDiscoveryCommand({ net, publications }) {
    const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
        arweaveFetchImpl: net.fetchImpl
    });
    const { verifier } = composeWorldEncounterMaterialVerifier();
    const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
        discoveryServices: services,
        arweaveResolverOptions: { fetchImpl: net.fetchImpl },
        verifier
    });
    return composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider: { list: () => publications } });
}

function canvasCtx(overrides = {}) {
    return {
        selectedEncounter: null,
        materialInspection: null,
        discoveryCommand: null,
        discoveryObjectId: '',
        discoveryTag: '',
        discovering: false,
        discoveryError: null,
        discoveryResult: null,
        discoveryRequestId: 0,
        discoverPublication: WorldEncounterCanvas.methods.discoverPublication,
        ...overrides
    };
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'view-discovery-alice');
        const publication = buildSignedPublication(alice);

        const net = makeFakeArweaveSubstrate();
        await announceArweaveMaterial(net, {
            tag: 'forkbuild-view-tag',
            objectId: publication.id,
            materialTxId: 'TX-VIEW',
            material: publication.toJSON()
        });

        const ctx = canvasCtx({
            discoveryCommand: realDiscoveryCommand({ net, publications: [publication] }),
            discoveryObjectId: publication.id,
            discoveryTag: 'forkbuild-view-tag'
        });

        ctx.discoverPublication();
        assert(ctx.discovering === true, '1. FLAGSHIP — clicking enters discovering state synchronously');

        await flushMicrotasks();

        assert(ctx.discovering === false, '2. FLAGSHIP — discovering returns to idle once the command resolves');
        assert(ctx.discoveryError === null, '3. FLAGSHIP — a successful call leaves no error notice');
        assert(ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '4. FLAGSHIP — Discovery: RESOLVED, through the real end-to-end chain');
        assert(ctx.discoveryResult.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '5. FLAGSHIP — Material: AVAILABLE — the exact existing inspection shape 0.9.39 already defines');
        assert(ctx.discoveryResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '6. FLAGSHIP — Verification: VERIFIED — discovery reached all the way to a real signature check');

        console.log('✓ Flagship: World View → Discover Publication → command → discovery → lead registry → RESOLVED → retrieval → verification → VERIFIED, rendered through the existing inspection shape');
    }

    // ---------------------------------------------------------------
    // Section B — no discovery: UNAVAILABLE remains UNAVAILABLE.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx({
            discoveryCommand: realDiscoveryCommand({ net: makeFakeArweaveSubstrate(), publications: [] }),
            discoveryObjectId: 'pub-nobody-has-heard-of',
            discoveryTag: 'forkbuild-nothing'
        });

        ctx.discoverPublication();
        await flushMicrotasks();

        assert(ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE,
            '7. no discovery — UNAVAILABLE remains UNAVAILABLE, never a fabricated result');
        assert(ctx.discoveryResult.inspection === null, '8. UNAVAILABLE resolution — inspection stays null');

        console.log('✓ Section B: no discovery — UNAVAILABLE remains UNAVAILABLE');
    }

    // ---------------------------------------------------------------
    // Section C — AMBIGUOUS discovery never produces an inspection object.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const carol = buildRealSigner(storage, 'view-discovery-carol');
        const publication = buildSignedPublication(carol, { id: 'pub-view-ambiguous', contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-AMBIGUOUS-VIEW', storage: 'ar' } });

        // Two independently-configured Nostr+Arweave leads for the same
        // uri — the existing chain resolves AMBIGUOUS, never merged. The
        // Arweave side reports that same uri through a real, envelope-aware
        // announcement transaction (0.9.494) — self-referential (the
        // announcement transaction's own id doubles as the material
        // location) is a legitimate, if unusual, publisher choice the
        // envelope format never forbids; resolution never reaches loading
        // here regardless (AMBIGUOUS short-circuits before inspection), so
        // no separate material transaction is needed for this section.
        const net = makeFakeArweaveSubstrate();
        net.ledger.set('TX-AMBIGUOUS-VIEW', {
            data: JSON.stringify({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'irrelevant', uri: 'ar://TX-AMBIGUOUS-VIEW' }),
            tag: { name: 'ForkBuild-Discovery-Tag', value: 'forkbuild-ambiguous-view' }
        });
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: async (relayUrl, filter) => {
                const tag = filter['#t'][0];
                if (tag !== 'forkbuild-ambiguous-view') return [];
                return [{ id: 'event-0', kind: 1, content: JSON.stringify({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'irrelevant', uri: 'ar://TX-AMBIGUOUS-VIEW' }) }];
            },
            arweaveFetchImpl: net.fetchImpl
        });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, verifier });
        const discoveryCommand = composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider: { list: () => [publication] } });

        const ctx = canvasCtx({ discoveryCommand, discoveryObjectId: publication.id, discoveryTag: 'forkbuild-ambiguous-view' });
        ctx.discoverPublication();
        await flushMicrotasks();

        assert(ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS,
            '9. two independently-reported leads for the same uri resolve AMBIGUOUS');
        assert(ctx.discoveryResult.inspection === null,
            '10. AMBIGUOUS never produces an inspection object — no guessed retrieval');

        console.log('✓ Section C: AMBIGUOUS discovery never produces an inspection object');
    }

    // ---------------------------------------------------------------
    // Section D — resolved but rejected: discovery is not verification.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const dave = buildRealSigner(storage, 'view-discovery-dave');
        const publication = buildSignedPublication(dave, { id: 'pub-view-tampered', contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-TAMPERED-VIEW', storage: 'ar' } });
        const tamperedMaterial = { ...publication.toJSON(), title: 'A Different Title Entirely' };

        const net = makeFakeArweaveSubstrate();
        await announceArweaveMaterial(net, {
            tag: 'forkbuild-tampered-view',
            objectId: publication.id,
            materialTxId: 'TX-TAMPERED-VIEW',
            material: tamperedMaterial
        });

        const ctx = canvasCtx({
            discoveryCommand: realDiscoveryCommand({ net, publications: [publication] }),
            discoveryObjectId: publication.id,
            discoveryTag: 'forkbuild-tampered-view'
        });

        ctx.discoverPublication();
        await flushMicrotasks();

        assert(ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '11. the association evidence still resolves RESOLVED — resolution and verification are separate questions');
        assert(ctx.discoveryResult.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '12. the tampered material still loads — retrieval never judges content');
        assert(ctx.discoveryResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '13. RESOLVED ≠ VERIFIED — content tampered with after signing is actively REJECTED, never a false pass');

        console.log('✓ Section D: a resolved lead whose material fails verification remains REJECTED — discovery is not verification');
    }

    // ---------------------------------------------------------------
    // Section E — local/decentralized separation.
    // ---------------------------------------------------------------
    {
        const localSelection = { kind: 'PUBLICATION', objectId: 'pub-local-evidence' };
        const localInspection = Object.freeze({ loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: { id: 'pub-local-evidence' } }, verification: { status: WorldEncounterMaterialVerificationStatus.VERIFIED } });

        const storage = new InMemoryStorageProvider();
        const erin = buildRealSigner(storage, 'view-discovery-erin');
        const publication = buildSignedPublication(erin, { id: 'pub-view-separate', contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-SEPARATE', storage: 'ar' } });

        const net = makeFakeArweaveSubstrate();
        await announceArweaveMaterial(net, {
            tag: 'forkbuild-separate-tag',
            objectId: publication.id,
            materialTxId: 'TX-SEPARATE',
            material: publication.toJSON()
        });

        const ctx = canvasCtx({
            selectedEncounter: localSelection,
            materialInspection: localInspection,
            discoveryCommand: realDiscoveryCommand({ net, publications: [publication] }),
            discoveryObjectId: publication.id,
            discoveryTag: 'forkbuild-separate-tag'
        });

        ctx.discoverPublication();
        await flushMicrotasks();

        assert(ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '14. the decentralized discovery itself succeeded');
        assert(ctx.selectedEncounter === localSelection,
            '15. a decentralized discovery result never overwrites the CURRENT local selection — the exact same reference, untouched');
        assert(ctx.materialInspection === localInspection,
            '16. a decentralized discovery result never overwrites or masquerades as locally stored Publication evidence — the exact same reference, untouched');

        console.log('✓ Section E: a decentralized discovery result never overwrites or masquerades as local selection/material evidence');
    }

    // ---------------------------------------------------------------
    // Section F — no duplicate fetching.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const ctx = canvasCtx({
            discoveryCommand: (request) => { calls += 1; return Promise.resolve({ discovery: {}, resolution: { status: 'RESOLVED' }, inspection: { loading: { status: 'AVAILABLE' }, verification: { status: 'VERIFIED' } } }); },
            discoveryObjectId: 'pub-no-dup',
            discoveryTag: 'forkbuild-no-dup'
        });

        ctx.discoverPublication();
        await flushMicrotasks();
        assert(calls === 1, '17. one click — exactly one discoveryCommand call, even though the resolved result already carries a complete inspection');

        console.log('✓ Section F: discoveryCommand is called exactly once per click — the resolved inspection is never re-fetched');
    }

    // ---------------------------------------------------------------
    // Section G — no discoveryCommand supplied.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx({ discoveryCommand: null, discoveryObjectId: 'pub-g', discoveryTag: 'tag-g' });
        ctx.discoverPublication();
        assert(ctx.discovering === false, '18. with no discoveryCommand supplied, the action never enters discovering state');
        assert(ctx.discoveryResult === null && ctx.discoveryError === null, '19. ...and never fabricates a result or error either — it is simply inert');

        console.log('✓ Section G: no discoveryCommand supplied — the panel stays entirely inert');
    }

    // ---------------------------------------------------------------
    // Section H — repeated clicks and a stale in-flight response.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        let resolveFirst;
        const ctx = canvasCtx({
            discoveryCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); },
            discoveryObjectId: 'pub-h',
            discoveryTag: 'tag-h'
        });

        ctx.discoverPublication();
        assert(ctx.discovering === true, '20. the first click enters discovering state synchronously');
        ctx.discoverPublication();
        ctx.discoverPublication();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 1, '21. clicking repeatedly while a call is in flight never starts a second, overlapping call');

        // A second, independent request supersedes the first before it
        // resolves (simulated by bumping the request id the same way a
        // fresh discoverPublication() call would, after manually letting
        // the in-flight promise settle stale).
        const staleRequestId = ctx.discoveryRequestId;
        ctx.discoveryRequestId += 1;
        resolveFirst({ discovery: {}, resolution: { status: 'RESOLVED' }, inspection: null });
        await flushMicrotasks();
        assert(ctx.discoveryResult === null,
            '22. a stale response (superseded by a newer request id) is discarded, never written');

        console.log('✓ Section H: repeated clicks never overlap, and a stale in-flight response is discarded');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression: WorldEncounterCanvas.js.
    // ---------------------------------------------------------------
    {
        const source = (await Promise.all(worldEncounterCanvasFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        const applicationImportLines = codeOnly.split('\n').filter((line) => line.includes("from '../../application/"));
        assert(applicationImportLines.length === 15,
            '23. WorldEncounterCanvas.js still imports exactly fifteen application/ modules — discoveryCommand is a plain injected function, never a new algorithm import; the seventh is 0.9.112\'s own PublicationMaterialProvenance.js, the eighth 0.9.144\'s own SnapshotPublicationAttribution.js, the ninth 0.9.176\'s own WorldEncounterPresentation.js, the tenth 0.9.177\'s own WorldSnapshotInspection.js, the eleventh 0.9.179\'s own MaterializedSnapshotWorldDiscoveryBridge.js (unregisterMaterializedSnapshotWorldSource() alone), the twelfth and thirteenth 0.9.182\'s own WorldEncounterComparisonCandidate.js/WorldSnapshotComparison.js, the fourteenth 0.9.183\'s own WorldSnapshotContentView.js, and the fifteenth 0.9.184\'s own WorldSnapshotContentComparisonView.js');

        assert(codeOnly.includes('discoveryCommand') && codeOnly.includes('discoverPublication'),
            '24. the new prop/method are actually present');
        assert((codeOnly.match(/this\.discoveryCommand\(/g) || []).length === 1,
            '25. discoveryCommand is called from exactly one place');

        const materialTitleCount = (codeOnly.match(/world-encounter-material-title/g) || []).length;
        const verificationTitleCount = (codeOnly.match(/world-encounter-verification-title/g) || []).length;
        assert(materialTitleCount === 2 && verificationTitleCount === 2,
            '26. the discovery panel reuses the EXACT SAME "world-encounter-material-title"/"world-encounter-verification-title" CSS classes the selection-driven panel already uses — one occurrence each in the template, never a differently-named second panel');
        assert(codeOnly.includes('discoveryResult.inspection.loading.status') && codeOnly.includes('discoveryResult.inspection.verification.status'),
            '27. the discovery panel renders the exact same loading.status/verification.status fields, the identical status vocabulary');

        assert(!/inspectWorldEncounterMaterial\(\s*\{[^}]*discoveryResult/s.test(codeOnly),
            '28. this component never calls inspectWorldEncounterMaterial() again for a discoveryResult — no duplicate fetching');
        assert(!/this\.materialInspection\s*=\s*(?!null)[^;]*discover/i.test(codeOnly),
            '29. discoverPublication() never writes into materialInspection — local/decentralized separation holds structurally, not just at runtime');
        assert(!/this\.selectedEncounter\s*=[^;]*discover/i.test(codeOnly),
            '30. discoverPublication() never writes into selectedEncounter either');

        console.log('✓ Section I: WorldEncounterCanvas.js reuses the exact existing Material/Verification markup, calls discoveryCommand from exactly one place, and never touches materialInspection/selectedEncounter');
    }

    // ---------------------------------------------------------------
    // Section J — architectural regression: ui/views/WorldView.js.
    // ---------------------------------------------------------------
    {
        const viewSourceUrl = new URL('../ui/views/WorldView.js', import.meta.url);
        const viewSource = await readFile(viewSourceUrl, 'utf8');
        const viewCodeOnly = viewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(viewCodeOnly.includes("inject('discoverWorldEncounterPublicationCommand', null)"),
            '31. WorldView.js still injects the existing discoverWorldEncounterPublicationCommand, defaulting to null');
        assert(/<WorldEncounterCanvas[\s\S]{0,700}:discoveryCommand="discoverWorldEncounterPublicationCommand"/.test(viewCodeOnly),
            '32. WorldView.js forwards the injected command straight to WorldEncounterCanvas\'s new discoveryCommand prop, verbatim — no wrapper');
        assert(!/function discoverWorldEncounterPublication\(/.test(viewCodeOnly),
            '33. the old page-local discoverWorldEncounterPublication() wrapper function is gone — WorldEncounterCanvas now owns the entire action');
        assert(!/discoveryObjectId\s*=\s*ref\(|const discoveryResult\s*=\s*ref\(/.test(viewCodeOnly),
            '34. the old page-local discovery input/result refs are gone — WorldEncounterCanvas now owns that ephemeral state');
        assert(!/<p>Resolution: \{\{ discoveryResult/.test(viewCodeOnly),
            '35. the old ad-hoc "Resolution: …" text is gone — replaced by the existing inspection markup rendered inside WorldEncounterCanvas');

        // The pre-existing (0.9.17/0.9.40/0.9.100/0.9.104) wiring is
        // unaffected.
        assert(viewCodeOnly.includes(':registry="worldDiscoverySourceRegistry"'), '36. the pre-existing registry binding is unchanged');
        assert(viewCodeOnly.includes(':worldDiscoveryLeadRegistry="worldDiscoveryLeadRegistry"'), '37. the pre-existing worldDiscoveryLeadRegistry binding is unchanged');
        assert(viewCodeOnly.includes(':distributionCommand="distributeWorldEncounterPublication"'), '38. the pre-existing distributionCommand binding is unchanged');

        console.log('✓ Section J: WorldView.js forwards the existing command verbatim as WorldEncounterCanvas\'s new prop, with no wrapper and no ad-hoc rendering of its own');
    }

    // ---------------------------------------------------------------
    // Section K — architectural regression: ui/main.js.
    // ---------------------------------------------------------------
    {
        const mainSource = (await Promise.all(mainFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');
        const mainCodeOnly = mainSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(mainCodeOnly.includes("import { composeDiscoverWorldEncounterPublicationCommand } from '../application/worldEncounter/DiscoverWorldEncounterPublicationCommandComposition.js';"),
            '39. ui/main.js imports the new 0.9.111 composition');
        assert(mainCodeOnly.includes('composeDiscoverWorldEncounterPublicationCommand({'),
            '40. ui/main.js actually calls it — not merely importing it unused');
        assert(mainCodeOnly.includes("app.provide('discoverWorldEncounterPublicationCommand', discoverWorldEncounterPublicationCommand);"),
            '41. ui/main.js still provides discoverWorldEncounterPublicationCommand app-wide, the same convention every other collaborator already uses');
        assert(!/decentralizedWorldEncounterMaterialDiscoveryRuntime\.discoverWorldEncounterPublication\(\{/.test(mainCodeOnly),
            '42. ui/main.js no longer calls the runtime directly inline — that now stays entirely inside the composed command');

        console.log('✓ Section K: ui/main.js composes discoverWorldEncounterPublicationCommand through the new named seam, rather than an inline, untested closure');
    }

    console.log('\n✅ All World View Decentralized Publication Retrieval tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
