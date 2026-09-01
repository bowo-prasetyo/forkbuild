import { readFile } from 'node:fs/promises';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { parseDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';
import { deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes } from '../application/DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js';
import {
    resolveDecentralizedWorldEncounterLeadFromRegistry,
    DecentralizedWorldEncounterLeadResolutionStatus
} from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { composeWorldEncounterMaterialSources } from '../application/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { inspectWorldEncounterMaterial } from '../application/WorldEncounterMaterialInspection.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';

// 0.9.43 — World Encounter Material Inspection Completion.
// See docs/Roadmap.md, "0.9.43 — World Encounter Material Inspection Completion."
//
// This is the flagship, whole-chain proof the 0.9.39-through-0.9.42 series
// was building toward: the composed verifier (0.9.43's own
// `composeWorldEncounterMaterialVerifier()`) is the final verification
// authority `application/WorldEncounterMaterialInspection.js` (0.9.39,
// unmodified) actually consults, fed the real material a full Nostr
// discovery → Arweave retrieval chain produced (0.9.28/0.9.32/0.9.34/0.9.36,
// each unmodified). No step below is a stand-in except the two genuine
// network edges (the Nostr relay and the Arweave gateway) — every
// application-layer boundary in between is this codebase's own real,
// already-shipped code.
//
//   Section A: FLAGSHIP — Nostr discovery envelope → lead → explicit
//              association → resolved lead → ar:// transaction → Arweave
//              retrieval → composed identity + Ed25519 verification →
//              VERIFIED, entirely through inspectWorldEncounterMaterial()
//   Section B: wrong objectId → REJECTED (a genuinely valid signature does
//              not save a structural mismatch — REJECTED beats VERIFIED)
//   Section C: tampered signature → REJECTED (a correct objectId does not
//              save a broken signature — REJECTED beats UNVERIFIABLE)
//   Section D: missing/unsigned signature → UNVERIFIABLE (a legacy,
//              never-signed Publication is neither confirmed nor rejected)
//   Section E: missing Arweave material → UNVERIFIABLE, and the composed
//              verifier is never even consulted
//   Section F: an ambiguous lead never produces a resolvedLead a caller
//              could route material loading through — no material loading
//   Section G: a lead that later disappears invalidates a previously
//              resolved/chosen reference — no material loading for a stale
//              choice
//   Section H: architectural regression — composeWorldEncounterMaterialVerifier()
//              still builds only 0.9.38/0.9.41/0.9.42's own unmodified
//              classes, and 0.9.42's own conservative composition semantics
//              (no per-kind applicability policy) are untouched

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

function buildRealSigner(username) {
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

// Builds a genuinely, cryptographically signed Publication using this
// codebase's own real Ed25519 signing machinery — the exact sequence
// tests/WorldEncounterMaterialSignatureVerifier.test.js already uses.
function signedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-flagship-1',
        documentId: 'doc-1',
        title: 'Discovered via Nostr, Retrieved via Arweave, Verified',
        author: 'alice',
        publisherIdentity,
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
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

// Discovers `objectId` through the identical Nostr-relay-event shape
// application/NostrDiscoveryQueryService.js's own header describes, and
// resolves it down to a single RESOLVED decentralized lead — the exact
// chain tests/DecentralizedWorldEncounterMaterialRuntimeComposition.test.js's
// own Section G already proves, reused here rather than reinvented.
function discoverAndResolveLead({ objectId, transactionId, registry, discoveryTag = 'forkbuild', origin = 'nostr:wss://relay.example' }) {
    const nostrEvent = {
        id: `nostr-event-${objectId}`,
        kind: 1,
        tags: [['t', discoveryTag]],
        content: JSON.stringify({
            protocol: 'forkbuild',
            version: 1,
            kind: WorldEncounterKind.PUBLICATION,
            objectId,
            uri: `ar://${transactionId}`
        })
    };
    const envelope = parseDecentralizedDiscoveryEnvelope(nostrEvent.content);
    assert(envelope !== null, `discovery envelope for ${objectId} parses`);

    registry.setLead(Object.freeze({ origin, discoveryTag, uri: `ar://${transactionId}`, storage: 'ar' }));

    const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
        envelopes: [envelope],
        leads: registry.listLeads()
    });

    return resolveDecentralizedWorldEncounterLeadFromRegistry({
        requestedMaterial: { kind: WorldEncounterKind.PUBLICATION, objectId },
        registry,
        associations
    });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the complete decentralized encounter path,
    // start to finish, through the real application-layer chain.
    // ---------------------------------------------------------------
    {
        const transactionId = 'ArweaveTxIdFlagshipVerified1';
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        const resolution = discoverAndResolveLead({ objectId: 'pub-flagship-1', transactionId, registry });
        assert(resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, '1. FLAGSHIP — discovery + explicit association resolves to exactly one lead');

        const resolvedLead = resolution.resolvedLead;
        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-flagship-1', origin: 'local' });

        const alice = buildRealSigner('alice-flagship');
        const publication = signedPublication(alice);

        const gateway = makeFakeGateway({
            handler: (url) => {
                assert(url === `https://arweave.net/${transactionId}`, '2. FLAGSHIP — the gateway request names exactly the resolved lead\'s own transaction id');
                return gatewayResponse(JSON.stringify(publication.toJSON()));
            }
        });
        const materialSources = composeWorldEncounterMaterialSources({ arweaveResolverOptions: { fetchImpl: gateway.fetchImpl } });
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const result = await inspectWorldEncounterMaterial({ resolvedSelection, resolvedLead, materialSources, verifier });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '3. FLAGSHIP — Arweave retrieval, through the composed decentralized source, succeeds');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '4. FLAGSHIP — the composed identity + Ed25519 signature verifier confirms the retrieved material end-to-end: VERIFIED');
        assert(gateway.requests.length === 1, '5. FLAGSHIP — exactly one Arweave gateway request served the whole chain');
    }
    console.log('✓ Section A: FLAGSHIP — Nostr discovery → lead → association → resolution → Arweave retrieval → composed verification → VERIFIED');

    // ---------------------------------------------------------------
    // Section B — wrong objectId → REJECTED. A genuinely valid signature
    // never rescues a structural mismatch.
    // ---------------------------------------------------------------
    {
        const transactionId = 'ArweaveTxIdWrongObjectId1';
        const alice = buildRealSigner('alice-b');
        const publication = signedPublication(alice, { id: 'pub-b-real-1' });

        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify(publication.toJSON())) });
        const materialSources = composeWorldEncounterMaterialSources({ arweaveResolverOptions: { fetchImpl: gateway.fetchImpl } });
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-b-DIFFERENT-1', origin: 'local' });
        const resolvedLead = Object.freeze({ origin: 'nostr:wss://relay.example', discoveryTag: 'forkbuild', uri: `ar://${transactionId}`, storage: 'ar' });

        const result = await inspectWorldEncounterMaterial({ resolvedSelection, resolvedLead, materialSources, verifier });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '6. the wrong-objectId scenario still retrieves real material — the mismatch is a verification fact, never a loading one');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED, '7. a selected objectId that does not match the retrieved material\'s own id is REJECTED, regardless of a genuinely valid signature');
    }
    console.log('✓ Section B: wrong objectId → REJECTED, even with a genuinely valid signature');

    // ---------------------------------------------------------------
    // Section C — tampered signature → REJECTED. A correct objectId never
    // rescues a broken signature.
    // ---------------------------------------------------------------
    {
        const transactionId = 'ArweaveTxIdTampered1';
        const alice = buildRealSigner('alice-c');
        const publication = signedPublication(alice, { id: 'pub-c-1' });
        const tampered = { ...publication.toJSON(), title: 'Tampered After Signing' };

        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify(tampered)) });
        const materialSources = composeWorldEncounterMaterialSources({ arweaveResolverOptions: { fetchImpl: gateway.fetchImpl } });
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-c-1', origin: 'local' });
        const resolvedLead = Object.freeze({ origin: 'nostr:wss://relay.example', discoveryTag: 'forkbuild', uri: `ar://${transactionId}`, storage: 'ar' });

        const result = await inspectWorldEncounterMaterial({ resolvedSelection, resolvedLead, materialSources, verifier });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '8. tampered material still loads — tampering is a verification fact, never a loading one');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED, '9. a matching objectId does not rescue a signature invalidated by post-signing tampering — REJECTED');
    }
    console.log('✓ Section C: tampered signature → REJECTED, even with a matching objectId');

    // ---------------------------------------------------------------
    // Section D — missing/unsigned signature → UNVERIFIABLE. Nothing was
    // ever cryptographically asserted, so this is neither a pass nor a
    // fail.
    // ---------------------------------------------------------------
    {
        const transactionId = 'ArweaveTxIdUnsigned1';
        const legacy = new Publication({ id: 'pub-d-1', documentId: 'doc-1', title: 'Legacy Unsigned', author: 'alice', signature: null, publisherIdentity: null });

        const gateway = makeFakeGateway({ handler: () => gatewayResponse(JSON.stringify(legacy.toJSON())) });
        const materialSources = composeWorldEncounterMaterialSources({ arweaveResolverOptions: { fetchImpl: gateway.fetchImpl } });
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-d-1', origin: 'local' });
        const resolvedLead = Object.freeze({ origin: 'nostr:wss://relay.example', discoveryTag: 'forkbuild', uri: `ar://${transactionId}`, storage: 'ar' });

        const result = await inspectWorldEncounterMaterial({ resolvedSelection, resolvedLead, materialSources, verifier });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '10. a legacy unsigned publication still loads fine');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, '11. a structurally-correct but never-signed publication is UNVERIFIABLE — never VERIFIED, never REJECTED');
    }
    console.log('✓ Section D: missing/unsigned signature → UNVERIFIABLE');

    // ---------------------------------------------------------------
    // Section E — missing Arweave material → UNVERIFIABLE, and the
    // composed verifier is never even consulted.
    // ---------------------------------------------------------------
    {
        const transactionId = 'ArweaveTxIdMissing1';
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('not found', { status: 404 }) });
        const materialSources = composeWorldEncounterMaterialSources({ arweaveResolverOptions: { fetchImpl: gateway.fetchImpl } });
        const { verifier, identityVerifier, signatureVerifier } = composeWorldEncounterMaterialVerifier();

        let identityCalls = 0;
        let signatureCalls = 0;
        const originalIdentityVerify = identityVerifier.verifyIdentity.bind(identityVerifier);
        const originalSignatureVerify = signatureVerifier.verifyIdentity.bind(signatureVerifier);
        identityVerifier.verifyIdentity = async (...args) => { identityCalls += 1; return originalIdentityVerify(...args); };
        signatureVerifier.verifyIdentity = async (...args) => { signatureCalls += 1; return originalSignatureVerify(...args); };

        const resolvedSelection = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-e-1', origin: 'local' });
        const resolvedLead = Object.freeze({ origin: 'nostr:wss://relay.example', discoveryTag: 'forkbuild', uri: `ar://${transactionId}`, storage: 'ar' });

        const result = await inspectWorldEncounterMaterial({ resolvedSelection, resolvedLead, materialSources, verifier });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '12. a 404 from the Arweave gateway resolves loading to UNAVAILABLE');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, '13. missing material is UNVERIFIABLE, never REJECTED and never silently skipped');
        assert(identityCalls === 0 && signatureCalls === 0, '14. neither sub-verifier is ever consulted when there is no material to hand them');
    }
    console.log('✓ Section E: missing Arweave material → UNVERIFIABLE, composed verifier never consulted');

    // ---------------------------------------------------------------
    // Section F — an ambiguous lead never produces a resolvedLead a
    // caller could route material loading through — no material loading.
    // ---------------------------------------------------------------
    {
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        const objectId = 'pub-f-ambiguous-1';
        const envelopeContentFor = (transactionId) => JSON.stringify({
            protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId, uri: `ar://${transactionId}`
        });

        // Two different discovery services each report a lead, and each
        // is independently corroborated by its own explicit association —
        // exactly 0.9.28's own "more than one currently-known lead" case.
        registry.setLead(Object.freeze({ origin: 'nostr:wss://relay-one.example', discoveryTag: 'forkbuild', uri: 'ar://ArweaveTxIdAmbiguousA', storage: 'ar' }));
        registry.setLead(Object.freeze({ origin: 'nostr:wss://relay-two.example', discoveryTag: 'forkbuild', uri: 'ar://ArweaveTxIdAmbiguousB', storage: 'ar' }));

        const envelopeA = parseDecentralizedDiscoveryEnvelope(envelopeContentFor('ArweaveTxIdAmbiguousA'));
        const envelopeB = parseDecentralizedDiscoveryEnvelope(envelopeContentFor('ArweaveTxIdAmbiguousB'));
        const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
            envelopes: [envelopeA, envelopeB],
            leads: registry.listLeads()
        });

        const resolution = resolveDecentralizedWorldEncounterLeadFromRegistry({
            requestedMaterial: { kind: WorldEncounterKind.PUBLICATION, objectId },
            registry,
            associations
        });
        assert(resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS, '15. two independently-corroborated leads for the same material resolve to AMBIGUOUS');
        assert(resolution.resolvedLead === null, '16. an AMBIGUOUS resolution never names a resolvedLead a caller could act on');

        // A caller honoring 0.9.39/0.9.40's own "no resolvedLead, no
        // routing" restraint (exactly what ui/components/WorldEncounterCanvas.js's
        // own resolvedLead computed property already enforces) never calls
        // inspectWorldEncounterMaterial() at all here — proven by a
        // decentralized source that would record a call if one ever
        // reached it.
        let loadCalls = 0;
        const spySource = { load: async () => { loadCalls += 1; return null; } };
        if (resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED) {
            await inspectWorldEncounterMaterial({
                resolvedSelection: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId, origin: 'local' }),
                resolvedLead: resolution.resolvedLead,
                materialSources: { decentralized: spySource },
                verifier: composeWorldEncounterMaterialVerifier().verifier
            });
        }
        assert(loadCalls === 0, '17. an ambiguous lead never reaches material loading — the decentralized source is never called');
    }
    console.log('✓ Section F: ambiguous lead → no resolvedLead → no material loading');

    // ---------------------------------------------------------------
    // Section G — a lead that later disappears invalidates a previously
    // resolved/chosen reference — no material loading for a stale choice.
    // ---------------------------------------------------------------
    {
        const registry = new DecentralizedWorldDiscoveryLeadRegistry();
        const objectId = 'pub-g-stale-1';
        const transactionId = 'ArweaveTxIdStale1';
        const lead = Object.freeze({ origin: 'nostr:wss://relay.example', discoveryTag: 'forkbuild', uri: `ar://${transactionId}`, storage: 'ar' });
        registry.setLead(lead);

        const envelope = parseDecentralizedDiscoveryEnvelope(JSON.stringify({
            protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId, uri: lead.uri
        }));
        const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({
            envelopes: [envelope],
            leads: registry.listLeads()
        });

        const firstResolution = resolveDecentralizedWorldEncounterLeadFromRegistry({
            requestedMaterial: { kind: WorldEncounterKind.PUBLICATION, objectId },
            registry,
            associations
        });
        assert(firstResolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, '18. the lead resolves once, before it disappears');
        const chosenLead = firstResolution.resolvedLead;

        // The lead's own discovery service withdraws it — exactly
        // application/DecentralizedWorldDiscoveryLeadRegistry.js's own
        // removeLead(), unmodified.
        registry.removeLead(lead.origin, lead.discoveryTag, lead.uri);

        // Re-resolving with the SAME associations (a caller re-checking a
        // stale choice, exactly like ui/components/WorldEncounterCanvas.js's
        // own `resolvedLead` computed re-validates a chosen candidate
        // against selectionOutcome's own CURRENT candidates on every read)
        // now finds nothing — the association still names the withdrawn
        // lead's own triple, but that triple is no longer among
        // registry.listLeads().
        const staleResolution = resolveDecentralizedWorldEncounterLeadFromRegistry({
            requestedMaterial: { kind: WorldEncounterKind.PUBLICATION, objectId },
            registry,
            associations
        });
        assert(staleResolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, '19. a withdrawn lead re-resolves to UNAVAILABLE — the previously resolved candidate list is never trusted blindly');
        assert(staleResolution.resolvedLead === null, '20. no resolvedLead survives the lead\'s own withdrawal');
        assert(!staleResolution.candidates.some((candidate) => candidate.uri === chosenLead.uri), '21. the previously chosen lead is no longer among the current candidates at all');

        // A caller that re-validates before loading (rather than trusting
        // its own previously-stored `chosenLead` reference forever) never
        // reaches material loading for the stale choice.
        let loadCalls = 0;
        const spySource = { load: async () => { loadCalls += 1; return null; } };
        const stillOffered = staleResolution.candidates.some((candidate) => candidate.uri === chosenLead.uri);
        if (stillOffered) {
            await inspectWorldEncounterMaterial({
                resolvedSelection: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId, origin: 'local' }),
                resolvedLead: chosenLead,
                materialSources: { decentralized: spySource },
                verifier: composeWorldEncounterMaterialVerifier().verifier
            });
        }
        assert(loadCalls === 0, '22. a stale, withdrawn lead choice never reaches material loading');
    }
    console.log('✓ Section G: a withdrawn lead invalidates a previously resolved/chosen reference → no material loading');

    // ---------------------------------------------------------------
    // Section H — architectural regression.
    // ---------------------------------------------------------------
    {
        const path = '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
        const fullSource = await readFile(new URL(path, import.meta.url), 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes('WorldEncounterMaterialIdentityVerifier'), '23. composes the 0.9.38 identity verifier');
        assert(codeOnly.includes('WorldEncounterMaterialSignatureVerifier'), '24. composes the 0.9.41 signature verifier');
        assert(codeOnly.includes('WorldEncounterMaterialVerificationComposition'), '25. delegates the actual reduction to the 0.9.42 composition class, never reimplementing it');
        assert(!/verifyIdentity\s*\(/.test(codeOnly.replace(/import[^\n]*\n/g, '')), '26. this file defines no verifyIdentity() of its own — composition, never a fourth verifier algorithm');
        assert(!/\bfetch\(/.test(codeOnly), '27. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '28. never references WebSocket');
        assert(!codeOnly.includes('StorageProvider'), '29. never imports or references StorageProvider — no storage access');

        const forbiddenTerms = ['trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `30. code must never use "${term}" — no trust/ranking vocabulary at this boundary`);
        }

        const compositionSource = await readFile(new URL('../application/WorldEncounterMaterialVerificationComposition.js', import.meta.url), 'utf8');
        const compositionCodeOnly = compositionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!compositionCodeOnly.includes('WorldEncounterMaterialIdentityVerifier') && !compositionCodeOnly.includes('WorldEncounterMaterialSignatureVerifier'), '31. the 0.9.42 composition class remains unmodified — still no knowledge of either concrete verifier by name, outside its own prose header');

        const inspectionSource = await readFile(new URL('../application/WorldEncounterMaterialInspection.js', import.meta.url), 'utf8');
        const inspectionCodeOnly = inspectionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!inspectionCodeOnly.includes('WorldEncounterMaterialVerifierRuntimeComposition') && !inspectionCodeOnly.includes('WorldEncounterMaterialVerificationComposition'), '32. the 0.9.39 inspection orchestrator remains unmodified — it still receives a verifier without knowing what is inside it, outside its own prose header');

        console.log('✓ Section H: architectural regression — composition only, no new verification algorithm, upstream boundary files untouched');
    }

    console.log('\nAll WorldEncounterMaterialInspectionCompletion tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
