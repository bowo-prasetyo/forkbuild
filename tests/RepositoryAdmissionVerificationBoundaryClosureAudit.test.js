import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationResolver } from '../application/publication/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/publication/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/publication/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/publication/PublicationContentValidator.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { WorldEncounterMaterialVerificationComposition } from '../application/worldEncounter/WorldEncounterMaterialVerificationComposition.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles, publicationsPageFiles, mainFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.524 — Repository Admission Verification Boundary Closure Audit.
//
// 0.9.523 found and fixed a real PRODUCT_GAP: World Encounter's own
// admitToRepositoryDiscovery() (ui/components/WorldEncounterCanvas.js)
// admitted a resolved Publication into the app-wide Repository catalog on
// `loading.status === 'AVAILABLE'` alone, never reading `verification.status`
// — unlike its DecentralizedPublicationsView.js sibling, which only ever
// admits after application/publication/PublicationResolver.js's full signature
// pipeline succeeds. The fix is one file, already merged. This milestone
// does not reopen that finding — it asks the one question a "fix, then
// audit again" arc always owes an answer to: is the fix actually
// consistent everywhere it needs to be, or does a corner remain where
// "successful retrieval" is still mistaken for "verified"?
//
//   Section A — World Encounter admission matrix: all five status
//               combinations the requesting brief names, three reachable
//               live through the real production pipeline, two proven
//               structurally unreachable AND independently rejected by
//               the gate itself (defense in depth, not merely "the
//               pipeline happens not to produce this").
//   Section B — Both World Encounter inspection paths (primary selection
//               and comparison target) forward `verification` correctly
//               through the SAME shared gate, live, including their
//               REJECTED/UNVERIFIABLE branches — not previously proven
//               live for the comparison path specifically.
//   Section C — The sibling path, re-executed live (envelope signature
//               failure, and a genuine-retrieval-but-corrupted-content
//               failure — the sibling's own analogue of "AVAILABLE but
//               not VERIFIED"), and the two gates' semantics compared
//               side by side.
//   Section D — Verification identity: VERIFIED/RESOLVED each trace to
//               the real, unmodified verifier/resolver classes production
//               actually wires — no cryptography reimplemented here.
//   Section E — Repository semantics after admission: searchable,
//               rejected material never inserted, and — the one angle
//               neither 0.9.523 nor 0.9.337 directly proved — a REJECTED
//               admission attempt leaves an already-populated catalog's
//               EXISTING entries untouched.
//   Section F — Failure isolation, including the comparison path's own
//               admission-failure isolation (not previously proven live).
//   Section G — Identity/provenance continuity, reconfirmed live for both
//               paths without re-deriving either one's full field-by-field
//               proof from scratch.
//   Section H — Cross-boundary regression: Repository search never
//               verifies; neither admission gate resolves or verifies
//               material itself; no invented auto-placement.
//   Section I — Classification and production guard.

const SOURCE_ROOT = new URL('../', import.meta.url);

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

// Flips one hex character of a hex-encoded signature/hash string, keeping
// it structurally valid hex (never appending non-hex characters) so a
// tamper test exercises a genuine cryptographic mismatch — Ed25519.verify()
// returning false — rather than merely crashing on malformed input.
function tamperHex(hex) {
    const flipped = hex[0] === '0' ? '1' : '0';
    return flipped + hex.slice(1);
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function makeSiblingPublication({ documentId, title, author }, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 128
    });
    let publication = new Publication({
        documentId, title, author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// The exact production gate ui/views/DecentralizedPublicationsView.js runs
// (see this file's own Section C for the structural proof this is not a
// paraphrase) — reproduced test-side, the identical technique
// tests/DecentralizedPublicationRepositoryIntegration.test.js's own Section
// A already established, so the functional sections below can exercise it
// without mounting a 700KB Vue single-file view.
function siblingAdmitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

function makeWorldPublication(overrides = {}) {
    return new Publication({
        id: 'pub-524',
        documentId: 'doc-524',
        title: 'A World-Encountered Publication (0.9.524)',
        author: 'alice',
        contentHash: 'hash-524',
        ...overrides
    });
}

// Minimal ctx mirroring the established `makeCtx()`/`canvasCtx()`
// convention (tests/RepositoryDiscoveryProductBoundaryReassessment.test.js,
// tests/WorldEncounterMaterialInspectionUI.test.js) — only the fields the
// real, unmodified refreshMaterialInspection()/refreshComparisonMaterial
// Inspection()/admitToRepositoryDiscovery() methods actually read.
function makeCanvasCtx({ material, available = true, verifierOutcome, discoveryProvider, comparison = false }) {
    const load = available ? { async load() { return material; } } : { async load() { return null; } };
    const base = {
        materialInspectionRequestId: 0,
        materialInspection: null,
        comparisonMaterialInspectionRequestId: 0,
        comparisonMaterialInspection: null,
        resolvedLead: null,
        materialSources: { peer: load },
        materialVerifier: verifierOutcome === undefined ? null : { async verifyIdentity() { return verifierOutcome; } },
        decentralizedPublicationDiscoveryProvider: discoveryProvider,
        admitToRepositoryDiscovery: WorldEncounterCanvas.methods.admitToRepositoryDiscovery
    };
    const selection = { kind: 'PUBLICATION', objectId: material ? material.id : 'missing', origin: 'peer:bob' };
    if (comparison) {
        base.comparisonResolvedSelection = selection;
        base.resolvedEncounterSelection = null;
    } else {
        base.resolvedEncounterSelection = selection;
        base.comparisonResolvedSelection = null;
    }
    return base;
}

async function run() {
    // ===============================================================
    // Section A — World Encounter admission matrix.
    // ===============================================================
    {
        // A1-A3. The three cells the real production pipeline can
        // actually reach, live, through the real, unmodified
        // refreshMaterialInspection() -> admitToRepositoryDiscovery()
        // chain.
        const provider = new DecentralizedPublicationDiscoveryProvider();

        const verifiedCtx = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-a-verified' }), available: true, verifierOutcome: true, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(verifiedCtx);
        await flush();
        assert(verifiedCtx.materialInspection.loading.status === 'AVAILABLE' && verifiedCtx.materialInspection.verification.status === 'VERIFIED',
            '1. setup sanity: AVAILABLE + VERIFIED is genuinely reachable.');
        assert(provider.list().includes(verifiedCtx.materialInspection.loading.material),
            '2. AVAILABLE + VERIFIED -> ADMITTED.');

        const rejectedCtx = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-a-rejected' }), available: true, verifierOutcome: false, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(rejectedCtx);
        await flush();
        assert(rejectedCtx.materialInspection.loading.status === 'AVAILABLE' && rejectedCtx.materialInspection.verification.status === 'REJECTED',
            '3. setup sanity: AVAILABLE + REJECTED is genuinely reachable.');
        assert(!provider.list().includes(rejectedCtx.materialInspection.loading.material),
            '4. AVAILABLE + REJECTED -> NOT admitted.');

        const unverifiableCtx = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-a-unverifiable' }), available: true, verifierOutcome: undefined, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(unverifiableCtx);
        await flush();
        assert(unverifiableCtx.materialInspection.loading.status === 'AVAILABLE' && unverifiableCtx.materialInspection.verification.status === 'UNVERIFIABLE',
            '5. setup sanity: AVAILABLE + UNVERIFIABLE (no verifier injected) is genuinely reachable.');
        assert(!provider.list().includes(unverifiableCtx.materialInspection.loading.material),
            '6. AVAILABLE + UNVERIFIABLE -> NOT admitted.');

        // A4. UNAVAILABLE + UNVERIFIABLE — reachable live, and the ONLY
        // way an UNAVAILABLE load can resolve, per application/
        // WorldEncounterMaterialInspection.js's own header
        // ("UNAVAILABLE material verifies as UNVERIFIABLE") — proven
        // here even with a verifier wired to always say `true`, showing
        // the pipeline itself, not merely an absent verifier, is what
        // forces this outcome.
        const unavailableCtx = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-a-unavailable' }), available: false, verifierOutcome: true, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(unavailableCtx);
        await flush();
        assert(unavailableCtx.materialInspection.loading.status === 'UNAVAILABLE',
            '7. setup sanity: a load that finds nothing reports UNAVAILABLE.');
        assert(unavailableCtx.materialInspection.verification.status === 'UNVERIFIABLE',
            '8. STRUCTURAL PROOF: even with a verifier that would say VERIFIED for real material, UNAVAILABLE material collapses to UNVERIFIABLE — application/worldEncounter/WorldEncounterMaterialVerification.js\'s own isUsableMaterial() guard runs BEFORE the injected verifier is ever asked, so "UNAVAILABLE + VERIFIED" cannot occur through the real production pipeline no matter what any verifier decides.');
        assert(provider.list().length === 1 && provider.list()[0] === verifiedCtx.materialInspection.loading.material,
            '9. UNAVAILABLE + UNVERIFIABLE -> NOT admitted (provider still holds only the one genuinely admitted Publication from A1-A2).');

        // A5. The fifth cell, "UNAVAILABLE + VERIFIED," is not merely
        // unreached above — it is structurally IMPOSSIBLE through the
        // real pipeline (A4's own point 8). What A5 proves instead is
        // that admitToRepositoryDiscovery() does not rely on that
        // impossibility for its own correctness: fed a hand-built,
        // self-contradictory pair directly (bypassing the loading/
        // verification pipeline entirely), the gate's own
        // `loading.status === 'AVAILABLE'` condition still refuses it —
        // defense in depth, not a gap the pipeline merely happens to
        // paper over.
        const contradictoryLoading = { status: 'UNAVAILABLE', material: makeWorldPublication({ id: 'pub-524-a-contradiction' }) };
        const contradictoryVerification = { status: 'VERIFIED' };
        WorldEncounterCanvas.methods.admitToRepositoryDiscovery.call(
            { decentralizedPublicationDiscoveryProvider: provider },
            contradictoryLoading, contradictoryVerification
        );
        assert(!provider.list().includes(contradictoryLoading.material),
            '10. DEFENSE IN DEPTH: even a hand-fed UNAVAILABLE + VERIFIED pair (impossible via the real pipeline, per A4) is independently refused by the gate\'s own loading.status check — the gate never admits on verification.status alone.');
        assert(provider.list().length === 1,
            '11. ... and admits nothing new — the provider still holds exactly the one legitimately admitted Publication.');
    }
    console.log('✓ Section A: all five matrix cells the requesting brief named are accounted for — three reachable live through the real pipeline (AVAILABLE+VERIFIED admits; AVAILABLE+REJECTED and AVAILABLE+UNVERIFIABLE do not), one reachable live and proven to always land on UNVERIFIABLE regardless of the injected verifier (UNAVAILABLE), and the remaining, pipeline-impossible cell (UNAVAILABLE+VERIFIED) independently refused at the gate itself. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section B — Both World Encounter inspection paths.
    // ===============================================================
    {
        const provider = new DecentralizedPublicationDiscoveryProvider();

        // B1. Comparison path, VERIFIED — admitted, exactly like the
        // primary selection path.
        const comparisonVerified = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-b-cmp-verified' }), available: true, verifierOutcome: true, discoveryProvider: provider, comparison: true });
        WorldEncounterCanvas.methods.refreshComparisonMaterialInspection.call(comparisonVerified);
        await flush();
        assert(comparisonVerified.comparisonMaterialInspection.verification.status === 'VERIFIED',
            '1. setup sanity: the comparison target resolves VERIFIED.');
        assert(provider.list().includes(comparisonVerified.comparisonMaterialInspection.loading.material),
            '2. a VERIFIED comparison target IS admitted — refreshComparisonMaterialInspection() forwards `result.verification`, not merely `result.loading`, into the SAME admitToRepositoryDiscovery() gate.');

        // B2. Comparison path, REJECTED — not admitted. Not previously
        // proven live anywhere: prior audits proved the comparison
        // path's admit-on-success case (0.9.474) and the primary
        // selection path's reject case (0.9.523), but never this exact
        // combination.
        const comparisonRejected = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-b-cmp-rejected' }), available: true, verifierOutcome: false, discoveryProvider: provider, comparison: true });
        WorldEncounterCanvas.methods.refreshComparisonMaterialInspection.call(comparisonRejected);
        await flush();
        assert(comparisonRejected.comparisonMaterialInspection.verification.status === 'REJECTED',
            '3. setup sanity: the comparison target resolves REJECTED.');
        assert(!provider.list().includes(comparisonRejected.comparisonMaterialInspection.loading.material),
            '4. a REJECTED comparison target is NOT admitted.');
        assert(comparisonRejected.comparisonMaterialInspection !== null,
            '5. ... yet the comparison PANEL still renders — rejection is a fact about Repository admission, never about whether the Wanderer can see what they are comparing against.');

        // B3. Comparison path, UNVERIFIABLE — not admitted.
        const comparisonUnverifiable = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-b-cmp-unverifiable' }), available: true, verifierOutcome: undefined, discoveryProvider: provider, comparison: true });
        WorldEncounterCanvas.methods.refreshComparisonMaterialInspection.call(comparisonUnverifiable);
        await flush();
        assert(comparisonUnverifiable.comparisonMaterialInspection.verification.status === 'UNVERIFIABLE',
            '6. setup sanity: no verifier injected -> UNVERIFIABLE.');
        assert(!provider.list().includes(comparisonUnverifiable.comparisonMaterialInspection.loading.material),
            '7. an UNVERIFIABLE comparison target is NOT admitted either — "we never looked" is exactly as insufficient for the comparison target as it is for the primary selection.');

        assert(provider.list().length === 1 && provider.list()[0] === comparisonVerified.comparisonMaterialInspection.loading.material,
            '8. across all three comparison-path attempts, the provider holds EXACTLY the one genuinely VERIFIED comparison target.');
    }
    console.log('✓ Section B: both World Encounter inspection paths enforce the identical verification gate, live — the comparison target\'s own REJECTED/UNVERIFIABLE branches (not previously exercised live) behave exactly like the primary selection\'s own, and a rejected comparison target still renders for the Wanderer to see. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section C — The sibling path, re-executed, and compared side by
    // side with Sections A/B.
    // ===============================================================
    {
        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const alice = makeIdentity('Alice-524');

        // C1. Genuine, valid publish + resolve -> RESOLVED -> admitted.
        // The sibling's own analogue of Section A's AVAILABLE+VERIFIED.
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const coordinator = new PublicationResolutionCoordinator(resolver, null);
        const provider = new DecentralizedPublicationDiscoveryProvider();

        const goodPublication = makeSiblingPublication({ documentId: 'doc-524-c-good', title: 'A Sibling-Resolved Publication', author: 'alice' }, alice);
        const goodEnvelope = await resolver.publish({ content: goodPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        const goodView = await resolvePublicationView(goodEnvelope, { coordinator, kindPlugins });
        assert(goodView.resolved === true, `1. setup sanity: a genuine, untampered envelope resolves (${goodView.reason}).`);
        siblingAdmitToRepositoryDiscovery(goodView, provider);
        assert(provider.list().includes(goodView.content), '2. RESOLVED -> ADMITTED — the legitimate sibling case still works.');

        // C2. Tampered ENVELOPE signature -> INVALID_PUBLICATION_SIGNATURE
        // -> not admitted. Rejected before content is ever even fetched
        // — the earliest possible rejection point, with no analogue on
        // the World Encounter side (which has only one signature check,
        // not an envelope/content pair) but structurally the same
        // refusal: a claim that was never cryptographically confirmed.
        const tamperedEnvelopeSignaturePublication = makeSiblingPublication({ documentId: 'doc-524-c-tampered-envelope', title: 'A Tampered-Envelope Publication', author: 'alice' }, alice);
        const tamperedEnvelope = await resolver.publish({ content: tamperedEnvelopeSignaturePublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        const tamperedEnvelopeJson = tamperedEnvelope.toJSON();
        tamperedEnvelopeJson.signature.signature = tamperHex(tamperedEnvelopeJson.signature.signature);
        const tamperedEnvelopeInstance = DecentralizedPublication.fromJSON(tamperedEnvelopeJson);
        const tamperedEnvelopeView = await resolvePublicationView(tamperedEnvelopeInstance, { coordinator, kindPlugins });
        assert(tamperedEnvelopeView.resolved === false,
            `3. a tampered envelope signature does not resolve (outcome: ${tamperedEnvelopeView.outcome}).`);
        siblingAdmitToRepositoryDiscovery(tamperedEnvelopeView, provider);
        assert(!provider.list().some((p) => p.documentId === 'doc-524-c-tampered-envelope'),
            '4. an unresolved (tampered-envelope) view is NOT admitted.');

        // C3. THE DEEP SYMMETRY CASE: genuine retrieval, corrupted
        // content — the sibling's own precise analogue of "loading
        // succeeded but verification did not." The envelope's own
        // signature is untouched and verifies; the referenced bytes are
        // genuinely present in the ContentStore (retrieval succeeds,
        // exactly like a World Encounter AVAILABLE load); only the
        // BYTES THEMSELVES were altered after publishing, so their hash
        // no longer matches what was signed.
        const corruptiblePublication = makeSiblingPublication({ documentId: 'doc-524-c-corrupted', title: 'A Publication Corrupted After Storage', author: 'alice' }, alice);
        const corruptibleEnvelope = await resolver.publish({ content: corruptiblePublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        const storedKey = `content:${corruptibleEnvelope.contentReference.hash}`;
        assert(storage.load(storedKey) !== null, '5. setup sanity: the published bytes are genuinely stored (a real, successful "retrieval" is possible).');
        const originalBytes = storage.load(storedKey);
        storage.save(storedKey, `${originalBytes.slice(0, -1)}X"`); // corrupt the tail, keeping it valid-ish JSON-shaped where feasible
        const corruptedView = await resolvePublicationView(corruptibleEnvelope, { coordinator, kindPlugins });
        assert(corruptedView.resolved === false,
            `6. GENUINE RETRIEVAL, CORRUPTED CONTENT -> NOT resolved (outcome: ${corruptedView.outcome}) — retrieval succeeding is never treated as verification succeeding, exactly mirroring Section A's AVAILABLE+REJECTED/UNVERIFIABLE cells.`);
        siblingAdmitToRepositoryDiscovery(corruptedView, provider);
        assert(!provider.list().some((p) => p.documentId === 'doc-524-c-corrupted'),
            '7. ... and is NOT admitted.');

        // C4. Side-by-side: structurally confirm both gates still hold
        // the exact shape 0.9.523's own audit already proved — cited,
        // not re-derived — then state the comparison this section's own
        // live proof above makes explicit: NEITHER gate ever admits on
        // "bytes arrived" alone; both require an explicit positive
        // result from a real, injected cryptographic verifier before
        // Repository ever sees the material.
        const siblingSource = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        assert(/view\.resolved && view\.content instanceof Publication/.test(siblingSource),
            "8. ui/views/DecentralizedPublicationsView.js's own admitToRepositoryDiscovery() gate is unchanged: `view.resolved` (true only after PublicationResolver's full envelope+content signature/hash pipeline).");
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(/loading\.status === 'AVAILABLE'[\s\S]{0,120}verification\.status === 'VERIFIED'/.test(canvasSource),
            "9. ui/components/WorldEncounterCanvas.js's own admitToRepositoryDiscovery() gate is unchanged: `loading.status === 'AVAILABLE' && ... && verification.status === 'VERIFIED'`.");
        assert(provider.list().length === 1 && provider.list()[0] === goodView.content,
            '10. after every attempt in this section, the provider holds EXACTLY the one genuinely resolved/verified Publication (C1\'s) — never the tampered-envelope or corrupted-content candidates.');
    }
    console.log('✓ Section C: the sibling path re-executed live — a genuine resolution is admitted; a tampered envelope signature and a genuinely-retrieved-but-corrupted content body are both refused, the latter being the sibling\'s own precise analogue of "successful retrieval is not the same fact as verified content." Both gates\' own literal conditions are reconfirmed unchanged from source. Same semantic invariant, two independent implementations. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section D — Verification identity.
    // ===============================================================
    {
        // D1. World Encounter's real production VERIFIED status traces
        // to the real, unmodified WorldEncounterMaterialVerificationComposition
        // class — used here as a black box over two synthetic
        // sub-verifiers standing in for the two real ones
        // (WorldEncounterMaterialIdentityVerifier, WorldEncounterMaterialSignatureVerifier)
        // ui/main.js actually composes. No cryptography is reimplemented
        // here — only the ALREADY-EXISTING composition rule (every
        // sub-verifier must agree) is exercised.
        const bothPass = new WorldEncounterMaterialVerificationComposition({
            verifiers: [{ verifyIdentity: async () => true }, { verifyIdentity: async () => true }]
        });
        assert((await bothPass.verifyIdentity()) === true,
            '1. both sub-verifiers agreeing -> true (the composition\'s own documented AND rule).');

        const onePassOneFail = new WorldEncounterMaterialVerificationComposition({
            verifiers: [{ verifyIdentity: async () => true }, { verifyIdentity: async () => false }]
        });
        assert((await onePassOneFail.verifyIdentity()) === false,
            '2. one sub-verifier explicitly refusing -> false, regardless of the other agreeing — identity confirmation alone is never enough without signature confirmation, or vice versa.');

        const onePassOneAbstain = new WorldEncounterMaterialVerificationComposition({
            verifiers: [{ verifyIdentity: async () => true }, { verifyIdentity: async () => undefined }]
        });
        assert((await onePassOneAbstain.verifyIdentity()) === undefined,
            '3. one sub-verifier abstaining -> undefined (UNVERIFIABLE upstream) — never silently promoted to true just because the other agreed.');

        // D2. The production wiring is exactly this composition, over
        // exactly the two real verifiers — structurally reconfirmed
        // from source, not re-derived.
        const compositionUseSource = await readSource('application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js');
        assert(/new WorldEncounterMaterialVerificationComposition\(\{\s*\n\s*verifiers: \[identityVerifier, signatureVerifier\]/.test(compositionUseSource),
            '4. application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js still composes exactly WorldEncounterMaterialIdentityVerifier + WorldEncounterMaterialSignatureVerifier — the same class exercised structurally in D1-D3 above, not a stand-in this milestone invented.');
        const mainSource = (await Promise.all(mainFiles().map((file) => readSource(file)))).join('\n');
        assert(mainSource.includes('composeWorldEncounterMaterialVerifier()') && mainSource.includes("app.provide('worldEncounterMaterialVerifier', worldEncounterMaterialVerifier)"),
            '5. ui/main.js provides that SAME composed verifier app-wide, under the name WorldView.js injects and passes into <WorldEncounterCanvas :materialVerifier>.');

        // D3. The sibling's own RESOLVED status traces to the real,
        // unmodified identity/LocalAuthorizationVerifier.js — Section C
        // already exercised it live (a genuine signature verifies; a
        // tampered one does not); reconfirmed here only as a structural
        // citation, not re-run, to avoid duplicating Section C's own
        // live proof.
        const resolverSource = await readSource('application/publication/PublicationResolver.js');
        assert(resolverSource.includes('this._verifier.verifyDecentralizedPublication(publicationJson)')
            && resolverSource.includes('kindPlugin.verify(contentJson)'),
            '6. application/publication/PublicationResolver.js still calls the injected verifier for BOTH the envelope signature and the wrapped content\'s own signature — the two checks Section C\'s live tamper tests each independently defeated.');
    }
    console.log('✓ Section D: VERIFIED and RESOLVED both trace to real, unmodified, already-existing verification classes — a composed identity+signature AND gate for World Encounter, and PublicationResolver\'s own envelope+content signature pipeline for the sibling. No cryptography was reimplemented or duplicated by this audit. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section E — Repository semantics after admission.
    // ===============================================================
    {
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const searchUseCase = new SearchPublicationsUseCase(provider);

        // E1. Admitted material is searchable through Repository's own
        // real, unmodified search — reconfirmed fresh.
        const admitted = makeWorldPublication({ id: 'pub-524-e-admitted', title: 'Searchable After Admission' });
        provider.add(admitted);
        const found = searchUseCase.execute({ text: 'Searchable After Admission' });
        assert(found.items.some((p) => p.id === admitted.id), '1. an admitted Publication is found by Repository search.');

        // E2. THE ANGLE NEITHER 0.9.523 NOR 0.9.337 DIRECTLY PROVED: a
        // REJECTED admission attempt against an ALREADY-POPULATED
        // catalog leaves every existing entry untouched — not merely
        // "the rejected item is absent" (already proven, Sections A-C),
        // but "nothing about what was already there changed."
        const beforeSnapshot = provider.list().slice();
        const ctx = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-e-rejected' }), available: true, verifierOutcome: false, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
        await flush();
        assert(provider.list().length === beforeSnapshot.length
            && provider.list().every((p, i) => p === beforeSnapshot[i]),
            '2. after a REJECTED admission attempt, the provider\'s existing entries are unchanged in both count and identity (same references, same order) — Repository admission failure never mutates, reorders, or evicts anything already catalogued.');
        const stillFound = searchUseCase.execute({ text: 'Searchable After Admission' });
        assert(stillFound.items.length === 1 && stillFound.items[0] === admitted,
            '3. the pre-existing entry is still independently findable by search, unaffected.');
    }
    console.log('✓ Section E: admitted material is searchable, rejected material is never inserted, and — newly proven by this closure audit — a rejected admission attempt against an already-populated catalog leaves every existing entry untouched, by reference. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section F — Failure isolation.
    // ===============================================================
    {
        // F1. Verification failure never breaks World rendering — both
        // inspection paths still produce a populated result on
        // REJECTED/UNVERIFIABLE.
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const rejectedCtx = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-f-rejected' }), available: true, verifierOutcome: false, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(rejectedCtx);
        await flush();
        assert(rejectedCtx.materialInspection !== null && rejectedCtx.materialInspection.loading.status === 'AVAILABLE',
            '1. a REJECTED verification still leaves materialInspection populated — World rendering is never gated on Repository admission succeeding.');

        // F2. Admission failure (a misbehaving injected provider) never
        // blocks World rendering — reconfirmed for BOTH inspection
        // paths; 0.9.523 proved this only for the primary selection
        // path.
        const throwingProvider = { add() { throw new Error('simulated 0.9.524'); } };
        const primaryCtx = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-f-throw-primary' }), available: true, verifierOutcome: true, discoveryProvider: throwingProvider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(primaryCtx);
        await flush();
        assert(primaryCtx.materialInspection !== null && primaryCtx.materialInspection.loading.status === 'AVAILABLE',
            '2. primary path: a throwing provider never turns an otherwise-successful resolution into a failed one.');

        const comparisonCtx = makeCanvasCtx({ material: makeWorldPublication({ id: 'pub-524-f-throw-comparison' }), available: true, verifierOutcome: true, discoveryProvider: throwingProvider, comparison: true });
        WorldEncounterCanvas.methods.refreshComparisonMaterialInspection.call(comparisonCtx);
        await flush();
        assert(comparisonCtx.comparisonMaterialInspection !== null && comparisonCtx.comparisonMaterialInspection.loading.status === 'AVAILABLE',
            '3. comparison path: the identical isolation holds — not previously proven live for this specific call site.');

        // F3. No fallback to "AVAILABLE is good enough" — structurally
        // reconfirmed: the gate's condition is a single conjunction, and
        // `verification.status === 'VERIFIED'` is not behind any `||`
        // that could be satisfied by loading status alone.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        const gateBody = canvasSource.slice(canvasSource.indexOf('admitToRepositoryDiscovery(loading, verification) {'), canvasSource.indexOf('admitToRepositoryDiscovery(loading, verification) {') + 600);
        assert(!/\|\|/.test(gateBody.slice(0, gateBody.indexOf('{') + 400)),
            '4. the admission condition itself contains no `||` — every clause (provider present, loading AVAILABLE, material is a Publication, verification VERIFIED) is required, none is an alternative to another.');

        // F4. Sibling failure isolation: a resolution failure never
        // throws from admitToRepositoryDiscovery() itself, and the
        // provider's own add() cannot throw for the one input shape the
        // gate ever hands it — reconfirmed structurally, since Section
        // C already proved this live (both tamper cases completed
        // without incident).
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(/throw new Error\('DecentralizedPublicationDiscoveryProvider\.add\(\) requires a Publication instance'\)/.test(providerSource),
            "5. add()'s own only documented throw condition is exactly the `instanceof Publication` case both gates already check before ever calling add() — confirming why neither sibling admission call site needs a try/catch of its own for THIS provider (unlike WorldEncounterCanvas.js's own defensive try/catch, which guards against an ARBITRARY injected prop, not merely this one class — see that method's own header, and Section H below).");
    }
    console.log('✓ Section F: verification failure never breaks World rendering; admission failure never blocks it, now proven live for the comparison path as well as the primary one; the gate\'s own condition is a pure conjunction with no "AVAILABLE is good enough" escape hatch; and the sibling path\'s lack of an explicit try/catch is confirmed to be safe by construction, not an overlooked gap. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section G — Identity/provenance continuity.
    // ===============================================================
    {
        // G1. World Encounter path — exact instance identity, plus the
        // concrete provenance fields the requesting brief names.
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const material = makeWorldPublication({
            id: 'pub-524-g-identity', documentId: 'doc-524-g-identity', contentHash: 'hash-524-g-identity'
        });
        const ctx = makeCanvasCtx({ material, available: true, verifierOutcome: true, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
        await flush();
        const admitted = provider.list()[0];
        assert(admitted === material, '1. the admitted object is the EXACT SAME instance — no reconstruction, no re-parse.');
        assert(admitted.id === material.id && admitted.documentId === material.documentId && admitted.contentHash === material.contentHash,
            '2. publicationId (id), documentId, and contentHash all survive intact.');

        // G2. Sibling path — already proven exhaustively, field by
        // field, by tests/DecentralizedPublicationRepositoryIntegration.test.js's
        // own Section G (documentId, contentReference, title, author,
        // license, schemaVersion, signature). Reconfirmed here only as
        // one fresh, live spot check against THIS milestone's own C1
        // scenario, not a full re-derivation.
        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const bob = makeIdentity('Bob-524');
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const coordinator = new PublicationResolutionCoordinator(resolver, null);
        const siblingProvider = new DecentralizedPublicationDiscoveryProvider();

        const original = makeSiblingPublication({ documentId: 'doc-524-g-sibling', title: 'Sibling Identity Spot Check', author: 'bob' }, bob);
        const envelope = await resolver.publish({ content: original, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: bob });
        const view = await resolvePublicationView(envelope, { coordinator, kindPlugins });
        siblingAdmitToRepositoryDiscovery(view, siblingProvider);
        const siblingAdmitted = siblingProvider.list()[0];
        assert(siblingAdmitted === view.content, '3. the sibling path also admits the exact resolved instance, not a copy.');
        assert(siblingAdmitted.documentId === 'doc-524-g-sibling'
            && siblingAdmitted.contentReference.hash === original.contentReference.hash
            && siblingAdmitted.signature !== null,
            '4. documentId, the content locator (contentReference.hash — the wrapped Publication\'s OWN reference, distinct from the envelope\'s own outer locator), and the signature (provenance) all survive the sibling path\'s own resolution+admission round trip.');
    }
    console.log('✓ Section G: identity/provenance continuity holds on both paths — the exact verified instance is admitted, never a reconstructed or downgraded candidate; publicationId, documentId, contentHash/contentReference, and signature all survive. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section H — Cross-boundary regression.
    // ===============================================================
    {
        // H1. Repository search never becomes a second verification
        // pipeline — none of its own files import any verifier class.
        const searchSource = await readSource('application/publication/SearchPublicationsUseCase.js');
        const localProviderSource = await readSource('discovery/LocalDiscoveryProvider.js');
        const decentralizedProviderSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        for (const [name, source] of [
            ['application/publication/SearchPublicationsUseCase.js', searchSource],
            ['discovery/LocalDiscoveryProvider.js', localProviderSource],
            ['discovery/DecentralizedPublicationDiscoveryProvider.js', decentralizedProviderSource]
        ]) {
            assert(!/Verifier|verifyIdentity|verifyDecentralizedPublication/.test(source),
                `1. ${name} imports or calls no verifier of any kind — Repository search/storage stays discovery/catalog functionality, never a second place authenticity is judged.`);
        }

        // H2. Neither admission gate resolves or verifies material
        // itself — each only ever READS an already-computed result.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        const canvasGateStart = canvasSource.indexOf('admitToRepositoryDiscovery(loading, verification) {');
        const canvasGateBody = canvasSource.slice(canvasGateStart, canvasSource.indexOf('\n    },', canvasGateStart));
        assert(!/inspectWorldEncounterMaterial|verifyWorldEncounterMaterial|loadWorldEncounterMaterial/.test(canvasGateBody),
            "2. WorldEncounterCanvas.js's own admitToRepositoryDiscovery() calls no loading or verification function itself — it only ever reads the `loading`/`verification` results its caller already computed.");

        const siblingSource = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        const siblingGateStart = siblingSource.indexOf('function admitToRepositoryDiscovery(view) {');
        const siblingGateBody = siblingSource.slice(siblingGateStart, siblingSource.indexOf('\n        }', siblingGateStart));
        assert(!/resolvePublicationView|coordinator\.resolve|resolver\.resolve/.test(siblingGateBody),
            "3. DecentralizedPublicationsView.js's own admitToRepositoryDiscovery() likewise calls no resolution function itself — it only ever reads `view.resolved`/`view.content`, already computed by resolveEntry()'s own prior call to resolvePublicationView().");

        // H3. No admission-triggered auto-placement into World — neither
        // gate calls anything beyond `.add()` on the discovery provider.
        assert(!/PlacePublicationUseCase|CreatePublicationSnapshotPlacementUseCase|CreateExternalSnapshotPlacementUseCase/.test(canvasGateBody)
            && !/PlacePublicationUseCase|CreatePublicationSnapshotPlacementUseCase|CreateExternalSnapshotPlacementUseCase/.test(siblingGateBody),
            '4. neither admission gate references any placement-creation use case — Repository admission still never spawns a World placement.');
    }
    console.log('✓ Section H: cross-boundary regression checks pass — Repository search/storage stay verification-free, both admission gates only ever read an already-computed result rather than performing resolution/verification themselves, and admission triggers no World placement. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section I — Classification and production guard.
    // ===============================================================
    {
        const CLASSIFICATIONS = Object.freeze([
            'PRODUCT_COMPLETE', 'PRODUCT_GAP', 'PRODUCT_AMBIGUITY', 'DELIBERATE_ASYMMETRY', 'REGRESSION'
        ]);
        const verdicts = {
            A_world_encounter_admission_matrix: 'PRODUCT_COMPLETE',
            B_both_inspection_paths: 'PRODUCT_COMPLETE',
            C_sibling_path_reexecution: 'PRODUCT_COMPLETE',
            D_verification_identity: 'PRODUCT_COMPLETE',
            E_repository_semantics_after_admission: 'PRODUCT_COMPLETE',
            F_failure_isolation: 'PRODUCT_COMPLETE',
            G_identity_provenance_continuity: 'PRODUCT_COMPLETE',
            H_cross_boundary_regression: 'PRODUCT_COMPLETE'
        };
        for (const verdict of Object.values(verdicts)) {
            assert(CLASSIFICATIONS.includes(verdict), `1. every section verdict uses the narrow, named vocabulary (found "${verdict}").`);
        }

        // I2. Production guard — this is a CLOSURE audit: it should find
        // nothing new to fix. No production file should be touched by
        // this milestone at all.
        let changedFiles = [];
        try {
            changedFiles = execSync(
                'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html" ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */,
                { cwd: SOURCE_ROOT.pathname }
            ).toString().trim().split('\n').filter(Boolean);
        } catch {
            changedFiles = ['<git unavailable>'];
        }
        // AMENDED BY 0.9.597 — Publication Action Provider Continuity Fix.
        // This guard is a live, point-in-time git-diff check at test-run
        // time, not a permanent guarantee — it always meant "this
        // milestone's OWN session touched nothing," never "no later,
        // separately-justified milestone ever will" (same, pre-existing
        // fragility already documented on the equivalent guard in
        // tests/FederatedRepositoryProductGapAudit.test.js, amended for
        // the same reason). Amended to exclude exactly 0.9.597's own,
        // already-accounted-for files, while still catching any OTHER,
        // unexpected production drift.
        const expectedLaterMilestoneFiles = new Set(['application/world/CreateWorldViewUseCase.js', 'application/world/WorldNavigationSession.js', 'ui/views/WorldView.js']);
        const unexpectedChangedFiles = changedFiles.filter((f) => !expectedLaterMilestoneFiles.has(f));
        assert(unexpectedChangedFiles.length === 0,
            `2. AMENDED BY 0.9.597 — this closure audit touches NO UNEXPECTED production file (0.9.597's own, separately-justified files excepted; found: ${JSON.stringify(unexpectedChangedFiles)}) — the 0.9.523 fix already closed the gap; this milestone only re-proves the boundary, from every angle the requesting brief named, without opening a new one.`);
    }
    console.log('✓ Section I: PRODUCT_COMPLETE across every section — no new gap, no production change. The 0.9.523 fix is consistently enforced everywhere it needs to be: both World Encounter inspection paths, the sibling Publications-page path, and the Repository catalog they both feed.');

    console.log('\nAll Repository Admission Verification Boundary Closure Audit tests passed.');
    console.log('\n=== 0.9.524 VERDICT ===');
    console.log('PRODUCT_COMPLETE. Every production path that can admit a Publication into Repository discovery — World Encounter\'s');
    console.log('primary selection, its comparison target, and the DecentralizedPublicationsView.js sibling — now requires the same');
    console.log('kind of evidence: a real, positive result from an actual cryptographic verifier, never mere successful retrieval.');
    console.log('The one matrix cell that could not be reached live (UNAVAILABLE + VERIFIED) is structurally impossible through the');
    console.log('real pipeline AND independently refused by the admission gate itself. No new architectural surface was introduced;');
    console.log('no production file was touched. Per this milestone\'s own brief: STOP this Repository-admission arc. The next');
    console.log('milestone should come from a new, concrete, user-facing gap — not from re-auditing this boundary again.');
}

run().catch((error) => {
    console.error('✗ RepositoryAdmissionVerificationBoundaryClosureAudit tests failed:', error.message);
    console.error(error);
    process.exitCode = 1;
});
