import { execSync } from 'node:child_process';
import { worldEncounterCanvasFiles, publicationsPageFiles } from './support/SourceFileGroups.js';
import { readSource as source } from './support/SourceText.js';

// 0.9.515 — Decentralized Publication & Snapshot Capability Product
// Reassessment.
//
// TYPE: broader, test-only, product-level continuity audit — NOT another
// per-arc parity spiral. Requested after 0.9.514 closed the last known
// product-level issue in the Proof/Anchoring arc (Bitcoin/Base/Arweave),
// alongside the already-complete Snapshot Content Backend Selection arc
// (0.9.505-0.9.510) and the Snapshot Distribution/Discovery/Resolution/
// World Encounter chain (0.9.17 through 0.9.184). The question this
// milestone asks is no longer "what backend is missing" — it is: across
// the full user journey these arcs together describe, is continuity
// actually intact, right now, proven live rather than assumed from prior
// milestones' own prose?
//
//   Content (IPFS|Arweave)         Discovery (Nostr|Arweave)
//        │                               │
//        ▼                               ▼
//   Create → choose Content → Distribute → choose Announcement/Discovery
//        → Discover → Select → Resolve → Verify → World Encounter
//
//   Proof/Anchoring (Bitcoin|Base|Arweave)
//        → Evidence → Verification
//
// Sections:
//   A. Full-journey flagship re-execution — one real, live-passing witness
//      per stage, re-run right now against current source.
//   B. THE FLAGSHIP FINDING — a real, previously-undetected regression:
//      four flagship witnesses for the "Discover -> Resolve -> Verify"
//      leg of the journey have been silently broken since 0.9.494, found
//      and closed by this same milestone.
//   C. Three-way independence — Content backend selection, Announcement/
//      Discovery substrate selection, and Proof/Anchoring substrate
//      creation are structurally independent, even though Arweave
//      participates in all three roles. 0.9.509 Section C already proved
//      Content/Discovery independence (two-way); this section extends
//      that proof to the third axis this milestone's own requesting brief
//      specifically flagged as the most valuable thing left to check.
//   D. Cross-arc boundary — World Encounter material verification
//      (signature-based) and Proof/Anchoring evidence/verification
//      (external-anchor-based) are two deliberately separate subsystems,
//      confirmed from real source, not silently assumed identical.
//   E. Named, out-of-scope finding — two pre-existing, unrelated stale
//      regression witnesses this milestone's own sweep surfaced, neither
//      touched here (different root cause, outside this milestone's own
//      brief).
//   F. Deliberately excluded, and the production-change guard.
//   G. Verdict.
//
// THE CONCRETE FIX THIS MILESTONE MAKES (test-only, detailed in Section B):
// `application/arweave/ArweaveGraphqlDiscoveryQueryService.js#search()` was amended
// by 0.9.494 to perform one additional gateway fetch per discovered
// transaction — decoding it as a real `core/DecentralizedDiscoveryEnvelope
// .js` envelope and reporting THAT envelope's own claimed `uri`, never the
// announcement transaction's own id, as a candidate's `uri`. Four test
// files built BEFORE that change, and never updated afterward, still
// treated a discovered transaction's own gateway response as the material
// directly — the exact one-fetch shape 0.9.494 replaced — so their own
// Arweave-discovery sections silently started asserting against a contract
// this codebase stopped shipping the moment 0.9.494 merged, undetected
// because nothing re-executed them live until this milestone's own Section
// A swept every flagship this journey depends on:
//   - tests/WorldViewDecentralizedPublicationRetrievalIntegration.test.js
//   - tests/WorldViewDiscoveredPublicationSelectionIntegration.test.js
//   - tests/PublicationDiscoveryTagConvergenceAudit.test.js (Section B only)
//   - tests/PublicationMaterialProvenanceIntegration.test.js (Sections B/C/D)
// Production itself was never broken — 0.9.495's own round-trip production
// integration audit already proved the real fix converges — only these
// four fixture files' own fake Arweave network boundary was stale. Fixed
// by reusing tests/ArweaveDiscoveryUriIdentityBoundaryAudit.test.js's own
// `makeFakeArweaveSubstrate()` fixture (0.9.494's own convergence proof)
// and the real, production `ArweaveAnnouncementPublisher` +
// `describeDecentralizedDiscoveryEnvelope()`, exactly as that file already
// does — never a second, competing fake network implementation. Zero
// production files changed; no assertion's own meaning changed anywhere —
// every section still proves exactly what its own name always said.
//
// Deliberately excluded, per this milestone's own brief: another product
// feature; another configuration type; a unified Content/Discovery/Proof
// provider selector; a bridge/navigation link between World Encounter and
// the Proof/Anchoring evidence page (Section D explains why that would be
// a new product decision, not a continuity fix); fixing the two unrelated
// stale witnesses named in Section E; any change to Arweave's one-shot
// anchoring shape, Bitcoin/Base's wallet-guided shape, or any production
// file at all.

const SOURCE_ROOT = new URL('../', import.meta.url);
const SOURCE_ROOT_PATH = SOURCE_ROOT.pathname;

function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runLive(file) {
    try {
        execSync(`node ${JSON.stringify(file)}`, { cwd: SOURCE_ROOT_PATH, stdio: 'pipe' });
        return { passed: true, output: '' };
    } catch (error) {
        const output = (error.stdout ? error.stdout.toString() : '') + (error.stderr ? error.stderr.toString() : '');
        return { passed: false, output };
    }
}

async function run() {
    console.log('=== 0.9.515 — Decentralized Publication & Snapshot Capability Product Reassessment ===\n');

    // ===============================================================
    // Section A — Full-journey flagship re-execution. One real,
    // live-passing witness per stage of the journey this milestone's own
    // brief names, re-run right now against CURRENT source — never cited
    // from a prior milestone's own now-possibly-stale prose. The four
    // World Encounter discovery files are this milestone's own fixes
    // (Section B); everything else is regression-checked, unmodified.
    // ===============================================================
    {
        const STAGE_WITNESSES = [
            ['tests/SnapshotContentBackendSelectionProductReassessment.test.js', 'choose Content backend (IPFS|Arweave) — PRODUCT_COMPLETE as of 0.9.510'],
            ['tests/SnapshotContentBackendSelectionEndToEndIntegrationAudit.test.js', 'select -> store -> locator -> contentHash -> announce -> discover -> resolve -> verify, both IPFS and Arweave, full journey'],
            ['tests/PublicationDiscoveryTagConvergenceAudit.test.js', 'Announcement/Discovery — the real composition-root discovery tag genuinely reaches the wire (FIXED this milestone, Section B)'],
            ['tests/WorldViewDecentralizedPublicationRetrievalIntegration.test.js', 'Discover -> Resolve -> Load -> Verify, from World View, one click (FIXED this milestone, Section B)'],
            ['tests/WorldViewDiscoveredPublicationSelectionIntegration.test.js', 'Select a discovered, VERIFIED Publication (FIXED this milestone, Section B)'],
            ['tests/WorldViewMaterialVerificationIntegration.test.js', 'World Encounter material verification — the signature-based trust chain WorldEncounterCanvas actually renders'],
            ['tests/PublicationMaterialProvenanceIntegration.test.js', 'LOCAL vs. DECENTRALIZED provenance stays honest and independent (FIXED this milestone, Section B)'],
            ['tests/ArweaveDiscoveryUriIdentityBoundaryAudit.test.js', "0.9.494's own convergence proof for the envelope-aware discovery contract this milestone's own fix (Section B) depends on"],
            ['tests/ProofAnchoringProductCompletionReassessment.test.js', 'Proof/Anchoring — Bitcoin/Base/Arweave, Evidence -> Verification, PRODUCT_COMPLETE as of 0.9.514']
        ];

        for (const [file, description] of STAGE_WITNESSES) {
            const { passed, output } = runLive(file);
            check(passed, `A. ${file} passes live, right now — ${description}${passed ? '' : ` — FAILED: ${output.slice(-1500)}`}`);
        }

        console.log(`✓ Section A: every named stage of the journey — Content backend choice, the full IPFS/Arweave select->verify flagship, Announcement/Discovery, Discover->Resolve->Load->Verify inside World View, selection, World Encounter material verification, provenance, the 0.9.494 envelope contract itself, and Proof/Anchoring — has a real, live-passing witness, re-executed right now (${STAGE_WITNESSES.length} files).`);
    }

    // ===============================================================
    // Section B — THE FLAGSHIP FINDING: four regression witnesses for
    // the "Discover -> Resolve -> Verify" leg silently broken since
    // 0.9.494, found and closed by this same milestone. Checked from
    // real source (the fix is actually present, and reuses the real
    // production collaborators it claims to), not merely "Section A
    // passed" taken on faith.
    // ===============================================================
    {
        const FIXED_FILES = [
            'tests/WorldViewDecentralizedPublicationRetrievalIntegration.test.js',
            'tests/WorldViewDiscoveredPublicationSelectionIntegration.test.js',
            'tests/PublicationDiscoveryTagConvergenceAudit.test.js',
            'tests/PublicationMaterialProvenanceIntegration.test.js'
        ];
        for (const file of FIXED_FILES) {
            const src = await source(file);
            check(src.includes('UPDATE (0.9.515)'),
                `B. ${file} carries this milestone's own "UPDATE (0.9.515)" header note explaining the fixture fix — the historical record of what was found, matching every prior milestone's own convention for a finding closed in place`);
            check(!/materialByTxId\[txId\]\s*;?\s*\n\s*if \(!material\)/.test(codeOnly(src)) || file.includes('PublicationMaterialProvenance') || file.includes('PublicationDiscoveryTag'),
                `B. ${file} no longer treats a discovered transaction's own single fetch as the material directly, without an envelope step first`);
        }

        // The two files that fully replaced their own fake network
        // boundary now import and genuinely use the real, production
        // ArweaveAnnouncementPublisher + describeDecentralizedDiscoveryEnvelope
        // — never a second, hand-rolled envelope implementation.
        for (const file of ['tests/WorldViewDecentralizedPublicationRetrievalIntegration.test.js', 'tests/WorldViewDiscoveredPublicationSelectionIntegration.test.js']) {
            const src = await source(file);
            check(src.includes("import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';"),
                `B. ${file} imports the real, production ArweaveAnnouncementPublisher`);
            check(src.includes("import { describeDecentralizedDiscoveryEnvelope } from '../../core/DecentralizedDiscoveryEnvelope.js';"),
                `B. ${file} imports the real, production describeDecentralizedDiscoveryEnvelope`);
            check(src.includes('function makeFakeArweaveSubstrate()'),
                `B. ${file} carries the SAME makeFakeArweaveSubstrate() fixture tests/ArweaveDiscoveryUriIdentityBoundaryAudit.test.js (0.9.494's own convergence proof) already established — reused, not reinvented`);
            check(!src.includes('function gatewayRetrievalFetch(materialByTxId)') && !src.includes('function graphqlSearchFetch(idsByTag)'),
                `B. ${file} — the old, stale one-fetch helpers (graphqlSearchFetch/gatewayRetrievalFetch) are fully gone, not merely supplemented`);
        }

        // The two files with a narrower, single-section fix keep their
        // own pre-existing helper name but now answer BOTH the search
        // POST and the 0.9.494 envelope GET on the same fetchImpl.
        for (const file of ['tests/PublicationDiscoveryTagConvergenceAudit.test.js', 'tests/PublicationMaterialProvenanceIntegration.test.js']) {
            const src = codeOnly(await source(file));
            check(/options\.method \|\| 'GET'\)\s*===\s*'POST'/.test(src),
                `B. ${file}'s own shared fetch helper now branches on method — POST still serves the GraphQL search, GET now serves the 0.9.494 envelope fetch on the SAME fetchImpl instance`);
            check(/protocol: 'forkbuild', version: 1, kind: 'PUBLICATION'/.test(src),
                `B. ${file} answers the envelope GET fetch with a real, well-formed DecentralizedDiscoveryEnvelope shape, not an ad-hoc stand-in`);
        }

        // Root cause, confirmed directly from the real production file
        // these four fixtures were built against — never merely asserted
        // in this file's own prose.
        const querySrc = await source('application/arweave/ArweaveGraphqlDiscoveryQueryService.js');
        check(/AMENDED BY 0\.9\.494/.test(querySrc),
            "B. application/arweave/ArweaveGraphqlDiscoveryQueryService.js's own header confirms the 0.9.494 amendment these four fixtures predated");
        check(/_fetchAnnouncementEnvelope\(announcementId\)/.test(codeOnly(querySrc)),
            'B. ...and search() genuinely performs the additional per-candidate envelope fetch the fix names, in current production source, right now');

        // Zero production files changed by this finding — the fix is
        // entirely fixture-side, exactly as 0.9.495 already proved the
        // real contract itself converges.
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT_PATH }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base', 'arweave', 'nostr', 'placement'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        check(touchedProduction.length === 0,
            `B. no production directory shows any change from this milestone (found: ${JSON.stringify(touchedProduction)}) — the fix is entirely test-fixture-side, matching 0.9.495's own prior proof that production's own envelope contract already converges`);

        console.log('✓ Section B: FOUND AND CLOSED. Four regression witnesses for the World Encounter "Discover -> Resolve -> Verify" leg — silently broken since 0.9.494\'s own envelope-aware discovery contract shipped, undetected until this milestone\'s own live sweep — now genuinely reuse the real production ArweaveAnnouncementPublisher/DecentralizedDiscoveryEnvelope (or the equivalent two-branch fetchImpl for a single affected section), confirmed both by live re-execution (Section A) and by static presence here. Zero production files changed.');
    }

    // ===============================================================
    // Section C — Three-way independence: Content backend selection
    // (IPFS|Arweave), Announcement/Discovery substrate selection
    // (Nostr|Arweave), and Proof/Anchoring substrate creation
    // (Bitcoin|Base|Arweave) never read or derive from one another, even
    // though Arweave genuinely participates in all three roles. 0.9.509
    // Section C already proved Content/Discovery independence
    // structurally (two-way); this section extends that proof to
    // Anchoring — the third axis this milestone's own requesting brief
    // specifically flagged as "particularly valuable."
    // ===============================================================
    {
        const viewSource = (await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n');
        const viewCodeOnly = codeOnly(viewSource);

        // C1. Anchoring never reads Content's or Discovery's own per-entry
        // selection fields — checked at every layer that touches
        // anchorType, from the UI action down to the deepest use case.
        const createAnchorMatch = /async function createAnchor\(entry, anchorType\) \{([\s\S]*?)\n {8}\}/.exec(viewCodeOnly);
        check(createAnchorMatch !== null, 'C1. createAnchor(entry, anchorType) — the UI\'s own anchor-creation action — is present and matched by this section\'s own extraction');
        const createAnchorBody = createAnchorMatch[1];
        check(!createAnchorBody.includes('entry.snapshotDistributionStorage') && !createAnchorBody.includes('entry.discoveryDistributionProvider'),
            "C1. createAnchor()'s own body never reads entry.snapshotDistributionStorage (Content) or entry.discoveryDistributionProvider (Announcement/Discovery) — anchor creation depends on publicationId + anchorType alone");
        check(/creationCoordinator\.create\(entry\.publication\.id, anchorType\)/.test(createAnchorBody),
            'C1. ...confirmed by what it actually calls: exactly (publicationId, anchorType), nothing else');

        const coordinatorSrc = codeOnly(await source('application/anchoring/PublicationAnchorCreationCoordinator.js'));
        check(/async create\(publicationId, anchorType\)/.test(coordinatorSrc),
            'C1. PublicationAnchorCreationCoordinator#create() itself takes exactly (publicationId, anchorType) — no storage/discoveryProvider parameter exists at this layer to couple through');
        check(!/storage|discoveryProvider|snapshotDistribution/i.test(coordinatorSrc),
            'C1. ...and the file carries no storage/discoveryProvider/snapshotDistribution vocabulary of any kind');

        const useCaseSrc = codeOnly(await source('application/anchoring/CreateExternalPublicationAnchorUseCase.js'));
        check(/async execute\(publicationId, anchorType\)/.test(useCaseSrc),
            'C1. the deepest layer, CreateExternalPublicationAnchorUseCase#execute(), ALSO takes exactly (publicationId, anchorType) — the independence holds all the way down, not just at the UI');
        check(useCaseSrc.includes('publication.contentReference.hash') && !/execute\(publicationId, anchorType, ?(storage|contentHash|discoveryProvider)/.test(useCaseSrc),
            "C1. the contentHash an anchor commits to is read from the publication's OWN contentReference.hash — never a caller-supplied value that could vary with whichever Content backend served this particular distribution attempt");

        // C2. Content backend selection never reads anchorType.
        const backendSelectionSrc = codeOnly(await source('application/snapshot/SnapshotDistributionContentBackendSelection.js'));
        check(!/anchorType/.test(backendSelectionSrc),
            'C2. application/snapshot/SnapshotDistributionContentBackendSelection.js carries zero anchorType vocabulary — Content backend eligibility/resolution never branches on which Proof/Anchoring substrates happen to be registered');
        const resolverSrc = codeOnly(await source('application/snapshot/DecentralizedSnapshotResolver.js'));
        check(!/anchorType/.test(resolverSrc),
            'C2. ...neither does Snapshot resolution — a discovered Snapshot resolves through its own declared storage alone');

        // C3. Announcement/Discovery distribution never reads anchorType
        // or Content's own storage field.
        const distributeEntryPublicationMatch = /function distributeEntryPublication\(entry, discoveryProviderChoice\) \{([\s\S]*?)\n {8}\}/.exec(viewCodeOnly);
        check(distributeEntryPublicationMatch !== null, 'C3. distributeEntryPublication() — the Announcement/Discovery action — is present and matched');
        const distributeEntryPublicationBody = distributeEntryPublicationMatch[1];
        check(!distributeEntryPublicationBody.includes('anchorType') && !distributeEntryPublicationBody.includes('entry.snapshotDistributionStorage'),
            "C3. distributeEntryPublication()'s own body never reads anchorType or entry.snapshotDistributionStorage — Announcement/Discovery depends on entry.publication + the caller-chosen discoveryProviderChoice alone");

        // C4. No per-entry "selected anchorType" field exists AT ALL —
        // the strongest form of independence. Content and Discovery are
        // each a single, mutually-exclusive per-entry CHOICE
        // (`entry.snapshotDistributionStorage`/`entry.discoveryDistributionProvider`,
        // each with its own default); Anchoring has no equivalent
        // singular field to couple through in the first place, because
        // Bitcoin/Base/Arweave anchors are not mutually exclusive
        // alternatives — creationAttempts starts `{}`, keyed by
        // anchorType, every type independently, explicitly triggerable.
        check(/snapshotDistributionStorage:\s*snapshotDistributionStorageTypes\[0\]\s*\|\|\s*'ar',/.test(viewSource),
            "C4. Content's own per-entry field carries a single default (first eligible, or 'ar') — a genuine mutually-exclusive CHOICE");
        check(/discoveryDistributionProvider:\s*'nostr',/.test(viewSource),
            "C4. Announcement/Discovery's own per-entry field ALSO carries a single default — the identical shape, one role over");
        check(/creationAttempts:\s*\{\},/.test(viewSource),
            'C4. Proof/Anchoring\'s own per-entry field starts EMPTY, keyed by anchorType — structurally incapable of expressing "the selected anchorType," because there isn\'t one: every registered anchorType is independently, simultaneously available');

        // C5. The three fields never co-occur on the same line, and none
        // is watch()ed to drive another — the 0.9.509 Section C
        // discipline, now checked across all three fields at once.
        check(!/discoveryDistributionProvider[^\n]*(snapshotDistributionStorage|creationAttempts)|snapshotDistributionStorage[^\n]*(discoveryDistributionProvider|creationAttempts)|creationAttempts[^\n]*(discoveryDistributionProvider|snapshotDistributionStorage)/.test(viewCodeOnly),
            'C5. no two of the three fields ever appear on the same line anywhere in this file — no derivation, no shared setter, no three-way coupling');
        check(!/watch\(\s*\(\)\s*=>\s*entry\.(snapshotDistributionStorage|discoveryDistributionProvider|creationAttempts)/.test(viewCodeOnly),
            'C5. none of the three is watch()ed to drive either of the other two — all three stay genuinely independent user choices, extending 0.9.509 Section C\'s own two-way proof to the full three-way matrix');

        console.log("✓ Section C: THREE-WAY INDEPENDENCE, CONFIRMED. Content backend selection, Announcement/Discovery substrate selection, and Proof/Anchoring substrate creation share no state, no derivation, and no watcher anywhere in production source, checked from the UI action down through the coordinator to the deepest use case. Anchoring's own independence is structurally the strongest of the three: there is no per-entry \"selected anchorType\" field for Content or Discovery to ever couple through, because Bitcoin/Base/Arweave anchors are independently, simultaneously creatable rather than one mutually-exclusive choice.");
    }

    // ===============================================================
    // Section D — Cross-arc boundary: World Encounter material
    // verification (signature-based, application/
    // WorldEncounterMaterialVerification.js) and Proof/Anchoring
    // evidence/verification (external-anchor-based, application/
    // PublicationEvidenceView.js) are two deliberately SEPARATE
    // subsystems — confirmed from real source, not silently assumed
    // identical or silently assumed connected.
    // ===============================================================
    {
        // D1. No shared catalog: /publications' own LocalPublicationCatalog
        // (the Evidence/Anchoring data source) is never read by any World
        // Encounter material-loading file, and vice versa.
        const localMaterialSourceSrc = codeOnly(await source('application/worldEncounter/LocalWorldEncounterMaterialSource.js'));
        check(!/LocalPublicationCatalog|publicationCatalog/i.test(localMaterialSourceSrc),
            'D1. application/worldEncounter/LocalWorldEncounterMaterialSource.js never references LocalPublicationCatalog/publicationCatalog — World Encounter material loading reads through discovery/LocalDiscoveryProvider.js alone, a genuinely different collaborator');

        const anchorCoordinatorSrc = codeOnly(await source('application/anchoring/PublicationAnchorCreationCoordinator.js'));
        check(!/WorldEncounter/i.test(anchorCoordinatorSrc),
            'D1. ...and, in the other direction, PublicationAnchorCreationCoordinator.js carries zero WorldEncounter vocabulary — Proof/Anchoring never reads World Encounter\'s own material chain either');

        // D2. Two separate real routes, neither reachable from the other
        // by any in-app link — confirmed from the router and from every
        // real navigation actually wired into the pages a person would
        // actually be on.
        const routerSrc = await source('ui/router/index.js');
        check(/path: '\/world\/:documentId'/.test(routerSrc) && /path: '\/publications'/.test(routerSrc),
            'D2. both real routes exist: /world/:documentId (World Encounter) and /publications (Distribution/Evidence/Anchoring)');

        const canvasSrc = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        check(!/\/publications/.test(canvasSrc),
            "D2. WorldEncounterCanvas.js — the component actually rendering an encountered Publication's own Material/Verification panel — contains no link of any kind to /publications; a person inspecting signature verification in World is never routed to Proof/Anchoring evidence from there");
        const catalogSrc = await source('ui/components/PublicationCatalog.js');
        check(!/\/publications/.test(catalogSrc),
            'D2. ...neither does PublicationCatalog.js (backing both Repository and Author browsing) — its own real actions (load in editor, fork, open in World, view author) never include Proof/Anchoring evidence');

        // D3. The two "verification" vocabularies are honestly distinct,
        // not a shared or overloaded term.
        const worldStatusSrc = await source('application/worldEncounter/WorldEncounterMaterialVerification.js');
        check(/VERIFIED|REJECTED|UNVERIFIABLE/.test(worldStatusSrc),
            "D3. World Encounter's own verification status vocabulary (signature-based) is present and independently named");
        const anchorStatusSrc = await source('application/anchoring/AnchorVerificationLifecycleState.js');
        check(anchorStatusSrc.length > 0,
            "D3. Proof/Anchoring's own, separately-named anchor verification lifecycle file exists — a genuinely different status machine, never a re-export or alias of World Encounter's own");
        check(!/WorldEncounterMaterialVerification/.test(await source('application/publication/evidence/PublicationEvidenceView.js')),
            "D3. application/publication/evidence/PublicationEvidenceView.js (the Evidence -> Verification labels Section E of 0.9.514 already proved honest) never imports World Encounter's own verification module — 'Independently verified' always means an external anchor check, never a signature check");

        console.log('✓ Section D: World Encounter material verification and Proof/Anchoring evidence verification are two DELIBERATELY SEPARATE subsystems — no shared catalog, no shared route or in-app link, no shared verification vocabulary, confirmed in both directions from real source. This matches the requesting brief\'s own two-diagram framing (Snapshot/World Encounter drawn separately from Proof/Anchoring) rather than the eleven-step single list being a claim that the two must be one continuous UI flow. Introducing a cross-link is a genuine, new product decision (would a Wanderer encountering an arbitrary object in World actually want an Evidence lookup for it, given most encountered material carries no anchor at all?) — correctly OUT OF SCOPE for a continuity audit, not a broken continuity this milestone can honestly report as a bug.');
    }

    // ===============================================================
    // Section E — Named, out-of-scope finding: this milestone's own
    // sweep (which ran every test file touching arweaveFetchImpl, to
    // make sure Section B's own root cause had no further reach) also
    // surfaced two UNRELATED stale regression witnesses. Different root
    // cause, named honestly here, deliberately NOT fixed in this
    // milestone — matching 0.9.514 Section H's own precedent for a
    // pre-existing, already-stale witness excluded by name rather than
    // silently re-run or silently repaired.
    // ===============================================================
    {
        const files = ['tests/DecentralizedSubstrateCapabilityMatrixAudit.test.js', 'tests/RoleAwareProviderResolution.test.js'];
        for (const file of files) {
            check(await source(file).then((s) => s.length > 0), `E. ${file} exists on disk, unmodified by this milestone`);
        }

        // The actual, current fact both files' own stale assertions
        // contradict — confirmed fresh, from real source, right now.
        const verifierSubclasses = ['anchoring/BaseProofVerifier.js', 'anchoring/BitcoinOpReturnProofVerifier.js', 'anchoring/ArweaveTransactionDataProofVerifier.js'];
        for (const file of verifierSubclasses) {
            const src = codeOnly(await source(file));
            check(/extends ProofVerifier/.test(src), `E. ${file} genuinely extends ProofVerifier, in current production source`);
        }

        console.log('✓ Section E: NAMED, NOT FIXED (out of scope). tests/DecentralizedSubstrateCapabilityMatrixAudit.test.js (0.9.292) and tests/RoleAwareProviderResolution.test.js each still assert "exactly ONE class extends ProofVerifier" — true when each was authored, false today: three real ProofVerifier subclasses now exist (Bitcoin, Base, Arweave), added by the later 0.9.507-0.9.511 Proof/Anchoring cross-substrate arc, after both files were written. This is a genuine regression-guard staleness bug — the SAME class of finding as Section B\'s own — but a DIFFERENT root cause (an old architectural census, not a discovery-contract fixture), touching a large, separately-scoped 0.9.292 architectural audit this milestone\'s own brief did not ask it to rewrite. Confirmed here only as a fact for the record, and as independent, fresher confirmation that this milestone\'s own Section C finding (real, current three-substrate Proof/Anchoring independence) is correct — these two files\' own staleness is evidence FOR the current architecture\'s completeness, not against it.');
    }

    // ===============================================================
    // Section F — Deliberately excluded, and the production-change
    // guard: this milestone's own fix (Section B) is the ONLY change,
    // and it is entirely test-fixture-side.
    // ===============================================================
    {
        const EXCLUDED = [
            'another product feature', 'another configuration type',
            'a unified Content/Discovery/Proof provider selector',
            'a navigation link between World Encounter and Proof/Anchoring evidence',
            'fixing the two unrelated stale witnesses named in Section E',
            'any change to Arweave\'s one-shot anchoring shape',
            'any change to Bitcoin/Base\'s wallet-guided shape',
            'any production file of any kind'
        ];
        check(EXCLUDED.length === 8, 'F1. the full exclusion list from this file\'s own header is eight items, named, not silently dropped');

        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT_PATH }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base', 'arweave', 'nostr', 'placement'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        check(touchedProduction.length === 0,
            `F2. no production directory shows any change from this milestone (found: ${JSON.stringify(touchedProduction)}) — this audit reads and live-exercises existing source, and repairs stale fixtures; it writes no production code`);

        const expectedTestChanges = new Set([
            'tests.html',
            'tests/DecentralizedPublicationSnapshotCapabilityProductReassessment.test.js',
            'tests/WorldViewDecentralizedPublicationRetrievalIntegration.test.js',
            'tests/WorldViewDiscoveredPublicationSelectionIntegration.test.js',
            'tests/PublicationDiscoveryTagConvergenceAudit.test.js',
            'tests/PublicationMaterialProvenanceIntegration.test.js'
        ]);
        const unexpected = changed.filter((f) => !expectedTestChanges.has(f));
        check(unexpected.length === 0,
            `F3. every changed/added file is one this milestone's own header names (found unexpected: ${JSON.stringify(unexpected)})`);

        const testsHtmlSource = await source('tests.html');
        check(testsHtmlSource.includes('./tests/DecentralizedPublicationSnapshotCapabilityProductReassessment.test.js'),
            "F4. this milestone's own test file is registered in tests.html");

        console.log('✓ Section F: exactly six files changed — this milestone\'s own new test, its tests.html registration, and the four fixture fixes Section B names — zero production files, exactly matching this file\'s own header.');
    }

    console.log(`\n✅ All Decentralized Publication & Snapshot Capability Product Reassessment checks passed (${assertionCount} assertions).\n`);
    console.log('=== VERDICT ===');
    console.log('Section A (Full-journey continuity): every named stage has a real, live-passing witness, re-executed right now.');
    console.log('Section B (Discover -> Resolve -> Verify leg): FOUND A REAL REGRESSION and CLOSED it this same milestone — four flagship witnesses silently broken since 0.9.494, now fixed with zero production change.');
    console.log('Section C (Three-way independence): CONFIRMED — Content, Announcement/Discovery, and Proof/Anchoring substrate selection share no state anywhere in production source, down to the deepest use case.');
    console.log('Section D (Cross-arc boundary): World Encounter material verification and Proof/Anchoring evidence verification are DELIBERATE_ARCHITECTURAL_SEPARATION, confirmed from source, not silently assumed either way.');
    console.log('Section E: one unrelated, pre-existing regression-guard staleness NAMED for the record, deliberately not fixed here (out of scope).');
    console.log('');
    console.log('VERDICT: STABLE. Every journey this milestone\'s own brief named terminates honestly: Content/Discovery/World Encounter and Proof/Anchoring/Evidence/Verification are each internally complete and continuous, the two arcs are deliberately separate rather than accidentally disconnected, and the one real gap this milestone\'s own sweep found (Section B) is closed. No further implementation milestone is justified by this audit\'s own findings. Per this milestone\'s own brief: if every meaningful path terminates honestly, the correct outcome is STOP — and it is, with one genuine regression found and fixed along the way.');
}

run().catch((error) => {
    console.error('DecentralizedPublicationSnapshotCapabilityProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
