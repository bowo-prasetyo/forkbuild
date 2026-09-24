import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles, publicationsPageFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { readDoc } from './support/DocText.js';

// 0.9.523 — Repository / Discovery Product Boundary Reassessment.
//
// The requesting brief drew a sharp line the whole 0.9.329-0.9.474 arc
// (Federated Repository Discovery, Decentralized Publication Repository
// Merge/Integration, World Encounter Repository Continuity) already
// answered exhaustively: does Repository ADMIT what World Encounter
// discovers (yes, proven live, four milestones over). This milestone asks
// a genuinely different question that arc never asked: once admitted,
// does Repository present a COHERENT catalog to the Wanderer browsing
// it — search semantics that mean what they say, duplicate/convergence
// behavior that makes sense, provenance that is neither invented nor
// misleadingly absent, and a firm boundary between "this is a discovery/
// catalog result" and "this has been verified"?
//
//   Section A — Admission continuity (reconfirmed, not re-derived).
//   Section B — Search semantics: does the UI overclaim what Repository
//               search actually covers?
//   Section C — Duplicate/convergence behavior: characterized, matching
//               four prior milestones' own deliberate no-dedup finding.
//   Section D — Provenance presentation: is anything being hidden, or is
//               there genuinely nothing to show?
//   Section E — FLAGSHIP: the resolution boundary. A real, demonstrated
//               gap — World Encounter's own Repository-admission gate
//               ignored material-verification outcome entirely, unlike
//               its DecentralizedPublicationsView.js sibling — found,
//               fixed, and proven closed live, both directions.
//   Section F — Failure comprehension: empty state and admission-failure
//               isolation, reconfirmed.
//   Section G — World Encounter <-> Repository relationship: two-way
//               continuity, with no invented auto-placement behavior.
//   Section H — Classification and production guard.

const SOURCE_ROOT = new URL('../', import.meta.url);

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function makePublication(overrides = {}) {
    return new Publication({
        id: 'pub-repo-523',
        documentId: 'doc-repo-523',
        title: 'A World-Encountered Publication',
        author: 'alice',
        ...overrides
    });
}

// Minimal ctx — only the fields refreshMaterialInspection()/
// admitToRepositoryDiscovery() actually read, mirroring the established
// `canvasCtx()` convention in tests/WorldEncounterMaterialInspectionUI.test.js
// and tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit.test.js,
// rather than reconstructing a full mount.
function makeCtx({ material, verifierOutcome, discoveryProvider }) {
    return {
        materialInspectionRequestId: 0,
        materialInspection: null,
        resolvedEncounterSelection: { kind: 'PUBLICATION', objectId: material ? material.id : 'missing', origin: 'peer:bob' },
        resolvedLead: null,
        materialSources: {
            peer: { async load() { return material; } }
        },
        materialVerifier: verifierOutcome === undefined ? null : { async verifyIdentity() { return verifierOutcome; } },
        decentralizedPublicationDiscoveryProvider: discoveryProvider,
        admitToRepositoryDiscovery: WorldEncounterCanvas.methods.admitToRepositoryDiscovery
    };
}

async function run() {
    // ===============================================================
    // Section A — Admission continuity.
    // ===============================================================
    {
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const material = makePublication();
        const ctx = makeCtx({ material, verifierOutcome: true, discoveryProvider: provider });

        WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx);
        await flush();

        assert(ctx.materialInspection !== null, '1. World rendering succeeds — a genuine resolution still produces materialInspection.');
        assert(provider.list().length === 1 && provider.list()[0] === material,
            '2. an encountered, VERIFIED Publication becomes discoverable — the identical instance, not a reconstruction.');
        assert(provider.list()[0].id === material.id && provider.list()[0].documentId === material.documentId,
            '3. exact Publication identity is preserved — id and documentId survive the admission unmodified.');

        // A4. Admission failure never breaks World rendering — the
        // try/catch this method has held since 0.9.474, reconfirmed live
        // against a provider whose own .add() throws.
        const throwingProvider = { add() { throw new Error('simulated'); } };
        const ctx2 = makeCtx({ material: makePublication({ id: 'pub-repo-523b' }), verifierOutcome: true, discoveryProvider: throwingProvider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(ctx2);
        await flush();
        assert(ctx2.materialInspection !== null && ctx2.materialInspection.loading.status === 'AVAILABLE',
            '4. admission failure (a misbehaving injected provider) never turns an already-successful World Encounter resolution into a failed one.');

        // A5. No admission mechanism was invented — the identical, single
        // .add() call site tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit
        // .test.js's own Section G already counted, reconfirmed unchanged
        // in count here.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        const addCallSites = (canvasSource.match(/decentralizedPublicationDiscoveryProvider\.add\(/g) || []);
        assert(addCallSites.length === 1, `5. still exactly one .add() call site (found ${addCallSites.length}) — no second, parallel admission mechanism was built for this milestone.`);
    }
    console.log('✓ Section A: admission continuity holds — identity preserved, no duplication of MECHANISM (Section C below addresses duplication of DATA), admission failure isolated from World rendering. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section B — Search semantics.
    // ===============================================================
    {
        const toolbarSource = await readSource('ui/components/PublicationCatalogToolbar.js');
        const repositoryViewSource = await readSource('ui/views/RepositoryView.js');
        const searchUseCaseSource = await readSource('application/publication/SearchPublicationsUseCase.js');

        // B1. The UI copy a Wanderer actually reads never claims a scope
        // wider than what SearchPublicationsUseCase actually searches
        // (the accumulated local + admitted-decentralized catalog) —
        // no "search the network," "search everywhere," or "search all
        // decentralized content" language anywhere a Wanderer sees it.
        const overclaimPattern = /search (the )?(network|everywhere|all decentralized|the entire|every peer)/i;
        assert(!overclaimPattern.test(toolbarSource) && !overclaimPattern.test(repositoryViewSource),
            "1. neither PublicationCatalogToolbar.js's own search form nor RepositoryView.js's own copy claims a search scope wider than what Repository search actually covers.");

        // B2. The placeholder itself names what is actually matched
        // (title, author) — never implies content-body or decentralized-
        // network reach.
        assert(/placeholder="Search by title, author/.test(toolbarSource),
            '2. the search input\'s own placeholder names exactly title/author — the two fields SearchPublicationsUseCase._matches() always checks — never a broader implied scope.');

        // B3. SearchPublicationsUseCase's own header already documents
        // this distinction precisely ("Repository Search Is Not World
        // Search") — reconfirmed on file, not re-derived.
        assert(searchUseCaseSource.includes('Repository search asks "which publications match this description?"'),
            "3. application/publication/SearchPublicationsUseCase.js's own header still states plainly what Repository search answers — reconfirmed against current source.");
    }
    console.log('✓ Section B: Repository search semantics are honestly represented — the UI never implies a scope ("all decentralized content everywhere") the implementation does not guarantee. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section C — Duplicate/convergence behavior.
    // ===============================================================
    {
        // C1. Structural: discovery/CompositeDiscoveryProvider.js's own
        // class body still contains no deduplication mechanism —
        // tests/DecentralizedPublicationRepositoryMerge.test.js's own
        // Section H already proved this; reconfirmed fresh here rather
        // than merely cited, since it is load-bearing for this section's
        // own live proof below.
        const compositeSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        const classBody = compositeSource.slice(compositeSource.indexOf('export class'));
        assert(!/dedup|new Set\(|new Map\(/i.test(classBody),
            '1. CompositeDiscoveryProvider.js still adds no deduplication of its own — structurally reconfirmed.');

        // C2. Live: the SAME Publication (by id), admitted twice — once
        // directly, once via a re-encounter — is retained twice by the
        // decentralized provider and appears twice in a Repository
        // search result. This is exactly discovery/
        // DecentralizedPublicationDiscoveryProvider.js's own documented
        // "no invented deduplication policy" (0.9.335), reconfirmed live
        // one more time, one layer up, through the real, unmodified
        // SearchPublicationsUseCase a Wanderer's own browser actually runs.
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const material = makePublication({ id: 'pub-repo-523-dup' });
        decentralizedProvider.add(material);
        decentralizedProvider.add(material); // a re-resolution of the identical Publication
        const localProvider = new LocalDiscoveryProvider({ load: () => null });
        const composite = new CompositeDiscoveryProvider([localProvider, decentralizedProvider]);
        const searchUseCase = new SearchPublicationsUseCase(composite);
        const result = searchUseCase.execute({ text: 'World-Encountered' });
        const matches = result.items.filter((p) => p.id === material.id);
        assert(matches.length === 2,
            `2. LIVE, RECONFIRMED: a twice-admitted Publication appears TWICE in a real Repository search result (found ${matches.length}) — this is the existing, deliberate, four-times-already-documented no-dedup posture (0.9.335, 0.9.339 Section H, FederatedRepositoryDiscoverySeamAudit Section J, DecentralizedPublicationDiscoveryIngestionSeamAudit Section I), not a new finding.`);

        // C3. This is characterized, not fixed — per every one of those
        // four prior milestones' own explicit verdict, a content-hash or
        // id-based dedup policy for a FEDERATED catalog is real future
        // work with real open questions (which observation is
        // authoritative? does a peer's own re-announcement count as a
        // second, independent witness worth keeping?) that this narrow
        // milestone does not have standing to answer by fiat.
    }
    console.log('✓ Section C: duplicate/convergence behavior reconfirmed live, one layer up (through a real Repository search, not merely the provider in isolation) — the resulting experience (the same publication listed twice) is a known, deliberate consequence of an already-made architectural choice, not a newly-discovered defect. DELIBERATE_ASYMMETRY (unchanged).');

    // ===============================================================
    // Section D — Provenance presentation.
    // ===============================================================
    {
        // D1. No per-item origin/source label exists anywhere in the
        // Repository-facing card/list presentation — never "Local,"
        // "Peer [id]," "Nostr," or "Arweave" per 0.9.516/0.9.521's own
        // established labeling family, and never a leaked protocol/
        // object-shape identifier either.
        const cardSource = await readSource('ui/components/PublicationCard.js');
        const listSource = await readSource('ui/components/PublicationList.js');
        assert(!/\b(Local|Peer|Nostr|Arweave)\b.*origin|origin.*\b(Local|Peer|Nostr|Arweave)\b/i.test(cardSource),
            '1. PublicationCard.js renders no per-publication provenance/origin label.');
        assert(!cardSource.includes('publication.origin') && !listSource.includes('publication.origin'),
            '2. ... confirmed structurally: neither reads a `.origin` field off the publication it renders.');

        // D2. This is not a gap, because there is genuinely nothing to
        // show — confirmed at the source of the data itself, not merely
        // inferred from its absence in the UI. discovery/
        // DecentralizedPublicationDiscoveryProvider.js's own add() takes
        // a bare Publication and nothing else (0.9.335's own explicit
        // "never a source/origin field on a result"); and World
        // Encounter's own admission call (Section A, above)
        // deliberately never forwards `resolvedLead.origin` either.
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(/add\(publication\) \{/.test(providerSource),
            "3. discovery/DecentralizedPublicationDiscoveryProvider.js's own add() takes exactly one argument, `publication` — no origin/source parameter alongside it, structurally confirmed — there is no provenance data being withheld from the UI; none was ever captured.");
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(canvasSource.includes('This file never reads `resolvedLead.origin`, `resolvedLead.discoveryTag`,')
            || (await readSource('application/worldEncounter/DecentralizedWorldEncounterMaterialSource.js')).includes('never reads `resolvedLead.origin`'),
            '4. the decentralized material path itself is on record as never even reading a lead\'s own origin — reconfirmed from source, not merely asserted.');
    }
    console.log('✓ Section D: no provenance is displayed, and none is being hidden — the underlying Publication objects Repository catalogs decentralized-origin material as carry no origin data at all, by an explicit, already-made 0.9.335 architectural decision. DELIBERATE_ASYMMETRY, not a gap.');

    // ===============================================================
    // Section E — FLAGSHIP: the resolution boundary.
    // ===============================================================
    {
        // E1. THE GAP, characterized precisely. Before this milestone,
        // ui/components/WorldEncounterCanvas.js's own admitToRepositoryDiscovery()
        // admitted on `loading.status === 'AVAILABLE'` alone — a fact
        // about successful RETRIEVAL (application/
        // DecentralizedWorldEncounterMaterialSource.js's own header:
        // "NO SIGNATURE VERIFICATION, NO HASH CHECK, NO TRUST DECISION OF
        // ANY KIND") — while never reading `verification.status`, even
        // though the caller (refreshMaterialInspection(), below) already
        // held it in scope. Its DecentralizedPublicationsView.js sibling's
        // own analogous gate (`view.resolved`) only ever becomes true
        // after application/publication/PublicationResolver.js's full envelope/bytes/
        // content signature-verification pipeline succeeds. The two
        // admission paths feeding the SAME Repository catalog therefore
        // held two different standards of evidence — an asymmetry a
        // Wanderer browsing Repository has no way to see, because
        // Section D already established Repository shows no provenance
        // at all.
        const siblingSource = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        assert(/view\.resolved && view\.content instanceof Publication/.test(siblingSource),
            "1. ui/views/DecentralizedPublicationsView.js's own admitToRepositoryDiscovery() gate still requires `view.resolved` — true only after full PublicationResolver signature verification — confirmed directly from source.");

        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(/admitToRepositoryDiscovery\(loading, verification\) \{[\s\S]{0,400}verification\.status === 'VERIFIED'/.test(canvasSource),
            "2. THE FIX: ui/components/WorldEncounterCanvas.js's own admitToRepositoryDiscovery() now also requires verification.status === 'VERIFIED', closing the asymmetry Section E1 names.");
        assert(/this\.admitToRepositoryDiscovery\(result\.loading, result\.verification\);/.test(canvasSource),
            '3. ... and both call sites (refreshMaterialInspection(), refreshComparisonMaterialInspection()) now forward the verification result, not merely the loading result.');

        // E2. Live proof, both directions, through the REAL production
        // method (WorldEncounterCanvas.methods.admitToRepositoryDiscovery),
        // never a hand-rolled stand-in.
        const provider = new DecentralizedPublicationDiscoveryProvider();

        const verifiedMaterial = makePublication({ id: 'pub-523-verified' });
        const verifiedCtx = makeCtx({ material: verifiedMaterial, verifierOutcome: true, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(verifiedCtx);
        await flush();
        assert(verifiedCtx.materialInspection.verification.status === 'VERIFIED', '4. setup sanity: the injected verifier confirms VERIFIED.');
        assert(provider.list().includes(verifiedMaterial),
            '5. a VERIFIED resolution IS admitted into Repository discovery — the legitimate case still works exactly as 0.9.474 built it.');

        const rejectedMaterial = makePublication({ id: 'pub-523-rejected' });
        const rejectedCtx = makeCtx({ material: rejectedMaterial, verifierOutcome: false, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(rejectedCtx);
        await flush();
        assert(rejectedCtx.materialInspection.verification.status === 'REJECTED', '6. setup sanity: the injected verifier returns false -> REJECTED.');
        assert(!provider.list().includes(rejectedMaterial),
            '7. GAP CLOSED: a REJECTED resolution (a load that succeeded but whose signature/identity does NOT correspond to the encounter) is no longer admitted into the app-wide Repository catalog.');

        const unverifiableMaterial = makePublication({ id: 'pub-523-unverifiable' });
        const unverifiableCtx = makeCtx({ material: unverifiableMaterial, verifierOutcome: undefined, discoveryProvider: provider });
        WorldEncounterCanvas.methods.refreshMaterialInspection.call(unverifiableCtx);
        await flush();
        assert(unverifiableCtx.materialInspection.verification.status === 'UNVERIFIABLE', '8. setup sanity: no verifier injected -> UNVERIFIABLE.');
        assert(!provider.list().includes(unverifiableMaterial),
            '9. GAP CLOSED: an UNVERIFIABLE resolution (nothing was ever checked) is ALSO no longer admitted — "we never looked" is never treated as good enough for an app-wide, cross-device catalog, exactly as application/worldEncounter/WorldEncounterMaterialVerification.js\'s own header already insists it must never be confused with a pass.');

        assert(provider.list().length === 1 && provider.list()[0] === verifiedMaterial,
            '10. after all three attempts, the provider holds EXACTLY the one genuinely VERIFIED Publication — never the REJECTED or UNVERIFIABLE ones.');

        // E3. Preserve: Repository result != Resolved material != Verified
        // material. A Repository result is still never silently promoted
        // beyond what World Encounter's own real, composed verifier
        // (identity + Ed25519 signature, ANDed together by application/
        // WorldEncounterMaterialVerificationComposition.js) actually
        // confirmed — reconfirmed structurally: the fix reuses that exact
        // existing status vocabulary, inventing no new "trusted"/"safe"
        // gradient of its own.
        const verificationSource = await readSource('application/worldEncounter/WorldEncounterMaterialVerification.js');
        assert(verificationSource.includes("'VERIFIED'") || verificationSource.includes('VERIFIED:'),
            '11. no new status vocabulary was invented — the fix reuses application/worldEncounter/WorldEncounterMaterialVerification.js\'s own existing three-value enum verbatim.');
    }
    console.log('✓ Section E: FLAGSHIP. A genuine, demonstrated PRODUCT_GAP — World Encounter\'s Repository-admission gate ignored verification outcome entirely, unlike its own sibling — found, fixed (admitToRepositoryDiscovery() now requires verification.status === VERIFIED), and proven closed live in both directions (VERIFIED admits; REJECTED and UNVERIFIABLE do not). PRODUCT_GAP -> FIXED.');

    // ===============================================================
    // Section F — Failure comprehension.
    // ===============================================================
    {
        // F1. Empty Repository / no matches: PublicationCatalog.js's own
        // emptyMessage computed already distinguishes "nothing published
        // yet" from "this search matched nothing" — reconfirmed on file.
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(/No publications yet\. Publish a creation from the Editor to see it here\./.test(catalogSource),
            '1. an empty Repository is communicated as "publish something," not a bare "0 results."');
        assert(/No matches for/.test(catalogSource),
            '2. a narrowed-to-nothing search is communicated distinctly from a genuinely empty catalog.');

        // F2. Admission failure isolation — reconfirmed live one more
        // time in this milestone's own record (Section A already proved
        // it; restated here as this section's own answer to "World
        // admission failure" specifically, per this milestone's own
        // brief).
        // (covered by Section A assertion 4, above — not re-run to avoid
        // duplicating a live peer/provider setup for an identical proof.)

        // F3. Duplicate candidates (Section C) are not flagged to the
        // Wanderer as an error or a warning — they simply render as two
        // ordinary cards. This is consistent with, not a contradiction
        // of, Section C's own DELIBERATE_ASYMMETRY finding: nothing in
        // this codebase's own product vocabulary (docs/Principles.md)
        // promises Repository will ever tell a Wanderer "you are seeing
        // a duplicate."
        const principles = await readDoc('docs/Principles.md');
        assert(!principles.includes('Repository warns of duplicate'),
            "3. no standing product promise exists that Repository will surface a duplicate-candidate warning — confirming Section C's own experience gap, if any, is not a broken promise.");
    }
    console.log('✓ Section F: failure/degenerate-state comprehension reconfirmed — a genuinely empty catalog reads differently from an unmatched search, and an admission failure never propagates into World rendering. PRODUCT_COMPLETE.');

    // ===============================================================
    // Section G — World Encounter <-> Repository relationship.
    // ===============================================================
    {
        // G1. Repository -> World: Explore navigates to the EXISTING
        // world route for that document — never creates a new placement,
        // never calls a placement-creation use case.
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(/viewWorld\(pub\) \{\s*\n\s*router\.push\(\{ path: `\/world\/\$\{pub\.documentId\}` \}\);/.test(catalogSource),
            "1. PublicationCatalog.js's own viewWorld() navigates to the existing /world/:documentId route by documentId — it constructs no placement, no encounter, no new World state.");
        assert(!/PlacePublicationUseCase|CreatePublicationSnapshotPlacementUseCase|CreateExternalSnapshotPlacementUseCase/.test(catalogSource),
            '2. ... confirmed structurally: PublicationCatalog.js imports no placement-creation use case at all — selecting a Repository result cannot silently spawn a World placement.');
        const router = await readSource('ui/router/index.js');
        assert(/path: '\/world\/:documentId'/.test(router),
            "3. the /world/:documentId route PublicationCatalog.js's own viewWorld() targets is a real, registered route.");

        // G2. World -> Repository: already the entire subject of the
        // 0.9.329-0.9.474 arc and Sections A/E above — reconfirmed by
        // reference, not re-derived a fifth time.
    }
    console.log('✓ Section G: two-way World Encounter <-> Repository continuity holds, with no invented auto-placement behavior in either direction — Explore is read-only navigation to an existing route. PRODUCT_COMPLETE / DELIBERATE_ASYMMETRY (no auto-spawn, as specified).');

    // ===============================================================
    // Section H — Classification and production guard.
    // ===============================================================
    {
        const CLASSIFICATIONS = Object.freeze([
            'PRODUCT_COMPLETE', 'PRODUCT_GAP', 'PRODUCT_AMBIGUITY', 'DELIBERATE_ASYMMETRY', 'REGRESSION'
        ]);
        const verdicts = {
            A_admission_continuity: 'PRODUCT_COMPLETE',
            B_search_semantics: 'PRODUCT_COMPLETE',
            C_duplicate_convergence: 'DELIBERATE_ASYMMETRY',
            D_provenance_presentation: 'DELIBERATE_ASYMMETRY',
            E_resolution_boundary: 'PRODUCT_GAP', // found and fixed this milestone
            F_failure_comprehension: 'PRODUCT_COMPLETE',
            G_world_encounter_relationship: 'PRODUCT_COMPLETE'
        };
        for (const verdict of Object.values(verdicts)) {
            assert(CLASSIFICATIONS.includes(verdict), `1. every section verdict uses the narrow, named vocabulary (found "${verdict}").`);
        }

        // H2. Production guard — exactly one production file changed by
        // this milestone: ui/components/WorldEncounterCanvas.js, closing
        // Section E's own flagship gap. Everything else this milestone
        // touched is test-only (this file, plus the two pre-existing
        // WorldEncounterRepositoryContinuity audits amended to keep
        // proving what they always proved against the tightened gate).
        let changedFiles = [];
        try {
            changedFiles = execSync(
                'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)docs/roadmap" ":(exclude)tests.html"',
                { cwd: SOURCE_ROOT.pathname }
            ).toString().trim().split('\n').filter(Boolean);
        } catch {
            changedFiles = ['<git unavailable>'];
        }
        // AMENDED BY 0.9.597 — Publication Action Provider Continuity Fix.
        // This guard is a live, point-in-time git-diff check at test-run
        // time, not a permanent guarantee — it always meant "this
        // milestone's OWN session touched only ui/components/WorldEncounterCanvas.js,"
        // never "no later, separately-justified milestone ever touches
        // anything else" (same, pre-existing fragility already documented
        // on the equivalent guard in tests/FederatedRepositoryProductGapAudit.test.js,
        // amended for the same reason). Amended to also exclude exactly
        // 0.9.597's own, already-accounted-for files, while still catching
        // any OTHER, unexpected production drift.
        // AMENDED BY 0.9.638 — Publication Commentary Distribution
        // Provider Selector adds ui/components/PublicationCard.js and
        // ui/components/PublicationList.js, unrelated to World Encounter
        // Repository-admission gating.
        const expectedLaterMilestoneFiles = new Set([
            'application/world/CreateWorldViewUseCase.js', 'application/world/WorldNavigationSession.js', 'ui/views/WorldView.js',
            'ui/components/PublicationCard.js', 'ui/components/PublicationList.js'
        ]);
        const unexpectedChangedFiles = changedFiles.filter((f) => f !== 'ui/components/WorldEncounterCanvas.js' && !expectedLaterMilestoneFiles.has(f));
        assert(unexpectedChangedFiles.length === 0,
            `2. AMENDED BY 0.9.597/0.9.638 — production changes are limited to this milestone's own flagship file plus 0.9.597's/0.9.638's own, separately-justified files (found unexpected: ${JSON.stringify(unexpectedChangedFiles)}).`);
    }
    console.log('✓ Section H: PRODUCT_COMPLETE (A, B, F, G), DELIBERATE_ASYMMETRY (C, D, both already-established, reconfirmed rather than re-litigated), PRODUCT_GAP -> FIXED (E, this milestone\'s own flagship). Production changed in exactly one file.');

    console.log('\nAll Repository Discovery Product Boundary Reassessment tests passed.');
    console.log('\n=== 0.9.523 VERDICT ===');
    console.log('The Repository experience is coherent EXCEPT for one real, now-fixed gap: World Encounter\'s own Repository-admission');
    console.log('gate ignored material-verification outcome, unlike its DecentralizedPublicationsView.js sibling. Fixed narrowly:');
    console.log('admitToRepositoryDiscovery() now requires verification.status === VERIFIED, proven live in both directions. Search');
    console.log('semantics, failure comprehension, and the World<->Repository boundary are all already coherent. Duplicate/convergence');
    console.log('and provenance-absence are both pre-existing, already-deliberate architectural choices, reconfirmed rather than');
    console.log('reopened. No new architectural surface was introduced. STOP unless a new, concrete, evidence-backed gap appears.');
}

run().catch((error) => {
    console.error('✗ RepositoryDiscoveryProductBoundaryReassessment tests failed:', error.message);
    console.error(error);
    process.exitCode = 1;
});
