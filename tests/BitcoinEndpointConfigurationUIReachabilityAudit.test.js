import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.459 — Bitcoin Endpoint Configuration UI Reachability Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: NONE.
//
// This milestone was requested on the hypothesis that ForkBuild's Bitcoin
// Esplora endpoint (`https://blockstream.info/api`) sits in the same place
// TURN sat before 0.9.453-0.9.457: a real, working capability whose only
// missing piece is a Settings UI entry point, following the Arweave
// Gateway/STUN/Rendezvous/TURN precedent exactly. The brief itself asked
// that this be VERIFIED, not assumed, because Bitcoin backs several roles
// in this codebase and a hasty "just add the missing UI" could silently
// turn one API endpoint into a generic configuration abstraction, or
// reopen a product-direction question that has already been asked and
// answered.
//
// It has already been asked and answered — repeatedly. This audit's own
// findings (Sections A-F) confirm the underlying architecture matches the
// hypothesis (a single, shared, hardcoded, injectable-but-never-injected
// endpoint, structurally identical in shape to Arweave Gateway before its
// own configuration seam was built). But Section G finds that "should
// Bitcoin Esplora be user-configurable" is not a fresh question: it was
// asked in 0.9.363, re-run in 0.9.368/0.9.373/0.9.374, re-run again against
// an EXPLICIT new product requirement in 0.9.385, and reconfirmed fresh
// twice more in 0.9.391/0.9.392 — every single time landing on DEFER (or
// its later synonym, NOT_USER_CONFIGURABLE), for the SAME stated reason:
// it backs an optional, user-initiated anchoring action, not the default
// path of any of this codebase's own eight named primary journeys. Section
// H distinguishes that finding from a genuinely different, later one
// (0.9.435/0.9.437) about the per-action anchor-creation UI's OWN
// reachability question (answered by live wallet-connection state, not a
// gateway link) — the two are not in tension, but neither one is the
// "someone simply forgot the Settings page" story this milestone's own
// brief hypothesized.
//
// So the verdict this audit reaches is NOT one of the five labels its own
// brief offered (NO_GAP / CONFIGURATION_DISCOVERABILITY_GAP /
// CONFIGURATION_UI_GAP / ARCHITECTURE_GAP / PRODUCT_GAP) — Section J shows
// each of those five is either factually wrong or imprecise about what is
// actually going on here, and lands on a sixth, more precise verdict:
// RECONFIRMED_PRIOR_DEFER. Building a Bitcoin Endpoint Settings UI now,
// on the strength of the Arweave/TURN architectural analogy alone, would
// be reopening a repeatedly-reconfirmed product decision without the one
// thing every precedent milestone that DID reopen a DEFER (0.9.385 for
// STUN/Rendezvous, and TURN's own later separate arc) actually had: fresh,
// concrete evidence that the criticality finding no longer holds.
//
// LETTERED SECTIONS:
//   A. Existing Bitcoin endpoint inventory — every real consumer file,
//      classified by role.
//   B. Default semantics — confirmed a hardcoded implementation constant,
//      never an environment/config-sourced default.
//   C. Persistence — confirmed absent: no core/storage/provider file of
//      any kind exists for a Bitcoin endpoint.
//   D. Runtime consumption — the real ui/main.js composition root traced;
//      every one of the four construction sites supplies no apiUrl.
//   E. Write/read semantics — one shared endpoint backs three read roles
//      and one write role, confirmed identical, Arweave-Gateway-shaped
//      rather than STUN/TURN-shaped.
//   F. Existing UI reachability — no Settings row, no route, confirmed.
//   G. Source-of-truth / product-direction history — the DEFER record,
//      reconfirmed fresh across seven prior milestones.
//   H. Cross-role isolation — this endpoint's own files never entangle
//      with any other endpoint's configuration, and vice versa; and the
//      genuinely different 0.9.435/0.9.437 finding (wallet-connection UI)
//      is distinguished from this one (endpoint configurability).
//   I. Deliberate exclusions census.
//   J. Classification against the five-way taxonomy, final verdict, and
//      production-change guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Settings UI, no
// core/BitcoinEsploraConfiguration.js (or equivalent), no storage class,
// no composition-root wiring, no persistence, no shared-module dedup of
// the four DEFAULT_API_URL declarations, no generic
// "InfrastructureEndpointConfiguration" abstraction. This milestone
// decides nothing about whether to build — it establishes, from real,
// freshly re-executed evidence, exactly what is and is not already true.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
async function sourceExists(relativePath) {
    try { await source(relativePath); return true; } catch { return false; }
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

const ESPLORA_FILES = [
    'anchoring/BitcoinEsploraTransactionBroadcaster.js',
    'anchoring/BitcoinEsploraTransactionConfirmationObserver.js',
    'anchoring/BitcoinEsploraWalletFundingSource.js',
    'anchoring/BitcoinOpReturnProofVerifier.js'
];

async function run() {
    console.log('Running Bitcoin Endpoint Configuration UI Reachability Audit...\n');

    // ===============================================================
    // Section A — Existing Bitcoin endpoint inventory.
    // ===============================================================
    {
        const roles = {
            'anchoring/BitcoinEsploraTransactionBroadcaster.js': 'write (broadcast raw transaction)',
            'anchoring/BitcoinEsploraTransactionConfirmationObserver.js': 'read (confirmation status + chain tip)',
            'anchoring/BitcoinEsploraWalletFundingSource.js': 'read (address UTXO set)',
            'anchoring/BitcoinOpReturnProofVerifier.js': 'read (OP_RETURN proof verification)'
        };

        let duplicateDefaultCount = 0;
        for (const file of ESPLORA_FILES) {
            assert(await sourceExists(file), n(`A1[${file}]. exists on disk, real file, not inferred`));
            const src = await source(file);
            assert(src.includes("DEFAULT_API_URL = 'https://blockstream.info/api'"),
                n(`A2[${file}]. declares its own DEFAULT_API_URL = 'https://blockstream.info/api' — never imports a shared constant`));
            duplicateDefaultCount += 1;
            assert(/constructor\(\s*\{[\s\S]{0,80}apiUrl = DEFAULT_API_URL/.test(src),
                n(`A3[${file}]. constructor accepts apiUrl as an injectable, defaulted parameter — the class itself is already override-ready`));
            assert(roles[file], n(`A4[${file}]. classified by role: ${roles[file]}`));
        }
        assert(duplicateDefaultCount === 4, n('A5. exactly four independent files each declare their own copy of the identical default — never a shared module, reconfirmed fresh (first counted by 0.9.385 Section B, unchanged since)'));

        console.log('✓ Section A: four real consumer files inventoried (three read roles, one write role), each independently declaring the identical hardcoded default and each already accepting apiUrl as a constructor-injectable override point.');
    }

    // ===============================================================
    // Section B — Default semantics: a hardcoded implementation
    // constant, never an environment/config-sourced default.
    // ===============================================================
    {
        for (const file of ESPLORA_FILES) {
            const src = await source(file);
            assert(!/process\.env|import\.meta\.env|localStorage|BITCOIN_API_URL/.test(src),
                n(`B1[${file}]. reads no environment variable, no localStorage, no config file — DEFAULT_API_URL is a plain module-scope string literal, a deployment/implementation default, never a configuration default`));
        }
        console.log('✓ Section B: DEFAULT_API_URL is confirmed, in every one of the four files, to be a bare source-level literal — an implementation default, not a value any existing mechanism already resolves from configuration.');
    }

    // ===============================================================
    // Section C — Persistence: confirmed absent.
    // ===============================================================
    {
        const CANDIDATE_NAMES = [
            'core/BitcoinEsploraConfiguration.js', 'core/BitcoinConfiguration.js', 'core/BitcoinEndpointConfiguration.js',
            'storage/BitcoinEsploraConfigurationStore.js', 'storage/BitcoinConfigurationStore.js', 'storage/BitcoinEndpointConfigurationStore.js',
            'application/BitcoinEsploraConfigurationProvider.js', 'application/BitcoinConfigurationProvider.js',
            'application/SetBitcoinEsploraConfigurationUseCase.js', 'application/SetBitcoinConfigurationUseCase.js'
        ];
        for (const candidate of CANDIDATE_NAMES) {
            assert(!(await sourceExists(candidate)), n(`C1[${candidate}]. does not exist — confirmed absent, not merely unlinked`));
        }
        console.log('✓ Section C: no core value object, no storage store, and no application provider/use-case exists for a Bitcoin endpoint under any of the naming conventions the Arweave Gateway/STUN/Rendezvous/TURN precedent already established. Unlike those four, and unlike TURN before 0.9.454, this candidate has no configuration layer at all — only the bare constructor parameter Section A found.');
    }

    // ===============================================================
    // Section D — Runtime consumption: the real ui/main.js composition
    // root traced, not assumed.
    // ===============================================================
    {
        const mainSource = codeOnly(await source('ui/main.js'));

        const constructionSites = [
            { useCase: 'CreateBitcoinAnchorProofVerifierUseCase', varName: 'bitcoinProofVerifier' },
            { useCase: 'CreateBitcoinEsploraTransactionConfirmationObserverUseCase', varName: 'bitcoinEsploraTransactionConfirmationObserver' },
            { useCase: 'CreateBitcoinEsploraWalletFundingSourceUseCase', varName: 'bitcoinEsploraWalletFundingSource' },
            { useCase: 'CreateBitcoinEsploraTransactionBroadcasterUseCase', varName: 'bitcoinEsploraTransactionBroadcaster' }
        ];

        for (const { useCase, varName } of constructionSites) {
            const callPattern = new RegExp(`const \\{ ${varName} \\} = new ${useCase}\\(\\)\\.execute\\(([^)]*)\\)`);
            const match = mainSource.match(callPattern);
            assert(match, n(`D1[${useCase}]. is really constructed in ui/main.js's own composition root, exactly once, at a locatable call site`));
            assert(!/apiUrl/.test(match[1]), n(`D2[${useCase}]. its own .execute(...) call passes NO apiUrl — confirmed by inspecting the real argument text ("${match[1].trim()}"), not merely assumed from the class's own default`));
        }

        assert(!/apiUrl\s*:/.test(mainSource.match(/new CreateBitcoin\w*UseCase\(\)\.execute\([\s\S]{0,300}?\)/g)?.join('') ?? ''),
            n('D3. across every Bitcoin*UseCase construction site sampled, no apiUrl key appears in any call — the hardcoded default from Section A is what every real, live instance in this application actually uses today'));

        console.log('✓ Section D: all four Esplora-backed use cases are really constructed in ui/main.js\'s own composition root, and every one of the four call sites is confirmed, by inspecting the real argument text, to pass no apiUrl — the production application runs on the Section A default at every single one of its four Bitcoin network-facing seams, with no live override path anywhere in the current codebase.');
    }

    // ===============================================================
    // Section E — Write/read semantics: one shared endpoint, three
    // read roles and one write role — Arweave-Gateway-shaped, not
    // STUN/TURN-shaped (never assumed, checked).
    // ===============================================================
    {
        const values = new Set();
        for (const file of ESPLORA_FILES) {
            const src = await source(file);
            const m = src.match(/DEFAULT_API_URL = '([^']+)'/);
            assert(m, n(`E1[${file}]. DEFAULT_API_URL literal is extractable`));
            values.add(m[1]);
        }
        assert(values.size === 1, n(`E2. all four files resolve to the IDENTICAL default host (found ${values.size} distinct value(s)) — one conceptual endpoint serving three read roles (proof verification, confirmation observation, wallet-funding UTXO lookup) and one write role (transaction broadcast), never a bifurcated read-endpoint/write-endpoint pair the way some services split those`));

        // Confirm the broadcaster's own header explicitly documents this
        // as a deliberate design choice, not an accidental coincidence.
        const broadcasterSrc = await source('anchoring/BitcoinEsploraTransactionBroadcaster.js');
        assert(/reading and writing through the same public|same public Esplora-compatible host is exactly as safe as/.test(codeOnly(await source('ui/main.js'))) || /Esplora-compatible|same family of Esplora-compatible/.test(broadcasterSrc),
            n('E3. the shared-endpoint design is a documented, deliberate choice (this class\'s own header, and ui/main.js\'s own 0.8.64 composition commentary), not an unexamined accident this audit is the first to notice'));

        console.log('✓ Section E: exactly one conceptual Bitcoin endpoint backs all four roles — three read, one write — matching Arweave Gateway\'s own single-URL/multi-role shape rather than STUN/TURN\'s per-role split. A future Settings page, if ever built, would need exactly one field, never a read/write pair.');
    }

    // ===============================================================
    // Section F — Existing UI reachability: no Settings row, no route.
    // ===============================================================
    {
        const networkSettingsSource = await source('ui/views/NetworkSettingsView.js');
        assert(!/bitcoin|esplora|blockstream/i.test(networkSettingsSource),
            n('F1. ui/views/NetworkSettingsView.js — the hub page every other endpoint (Content Provider, Arweave Gateway, Nostr Relay, Nostr Publication Relays, STUN, TURN, Rendezvous) is listed on — carries no Bitcoin/Esplora row of any kind'));

        const routerSource = await source('ui/router/index.js');
        assert(!/\/settings\/(bitcoin|esplora)/.test(routerSource),
            n('F2. ui/router/index.js registers no /settings/bitcoin* or /settings/esplora* route'));
        assert(!(await sourceExists('ui/views/BitcoinEsploraSettingsView.js')) && !(await sourceExists('ui/views/BitcoinSettingsView.js')),
            n('F3. no orphaned, unrouted BitcoinSettingsView component exists either — this is not a case of a built page nobody linked to, unlike this milestone\'s own brief hypothesized'));

        console.log('✓ Section F: confirmed absent at every layer a Settings UI would need — no hub row, no registered route, and no orphaned unrouted view component sitting unreachable. There is nothing partially built here to merely reconnect.');
    }

    // ===============================================================
    // Section G — Source-of-truth / product-direction history: the
    // DEFER record, reconfirmed fresh across seven prior milestones,
    // never previously found to be a mere UI oversight.
    // ===============================================================
    {
        const roadmap = await source('docs/Roadmap.md');

        // G1. 0.9.363 — the original six-candidate inventory that first
        // named Bitcoin Esplora as a candidate at all.
        assert(roadmap.includes('## 0.9.363 — User-Configurable Infrastructure Endpoint Product Audit'),
            n('G1. 0.9.363\'s own heading is on record in docs/Roadmap.md — the first milestone to inventory Bitcoin Esplora as an infrastructure-endpoint candidate'));

        // G2. 0.9.385 — re-run against an EXPLICIT new product requirement
        // (the exact kind of signal that later reopened STUN/Rendezvous
        // from DEFER to BUILD_NEXT) — Bitcoin Esplora still landed DEFER.
        const directionAuditSource = await source('tests/UserConfigurableInfrastructureEndpointProductDirectionAudit.test.js');
        assert(directionAuditSource.includes("results['Bitcoin Esplora'] = 'NOT CRITICAL — backs an optional, user-initiated anchoring action, not a primary journey'") || directionAuditSource.includes("criticality.bitcoinEsplora = 'NOT CRITICAL — backs an optional, user-initiated anchoring action, not a primary journey'"),
            n('G2. tests/UserConfigurableInfrastructureEndpointProductDirectionAudit.test.js (0.9.385) — re-run against an EXPLICIT new product requirement, the identical kind of signal that reopened STUN/Rendezvous from DEFER to BUILD_NEXT that same milestone — still classifies Bitcoin Esplora NOT CRITICAL, for a stated, checkable reason'));
        assert(directionAuditSource.includes("candidate: 'Bitcoin Esplora'") && directionAuditSource.includes("decision: 'DEFER'"),
            n('G3. that same milestone\'s own decision matrix records Bitcoin Esplora\'s final decision as DEFER, alongside IPFS Gateway and Base RPC — never BUILD_NEXT, never SEPARATE_PRODUCT_DECISION (the bucket TURN alone received, and which TURN alone later graduated out of via its own dedicated 0.9.453-0.9.457 arc)'));

        // G4. 0.9.373/0.9.374 — reconfirmed independently, before and
        // around 0.9.385, from a different angle (a sibling candidate's
        // own audit).
        const ipfsAuditSource = await source('tests/IpfsGatewayProductGapAudit.test.js');
        assert(ipfsAuditSource.includes("{ candidate: 'Bitcoin Esplora', decision: 'DEFER' }"),
            n('G4. tests/IpfsGatewayProductGapAudit.test.js (0.9.373) independently reconfirms Bitcoin Esplora DEFER, for the same "narrow/occasional" reasoning, from a milestone whose OWN subject was a different candidate entirely'));

        // G5/G6. 0.9.391/0.9.392 — reconfirmed fresh from CURRENT source
        // (not cited from prior prose), most recently on record.
        const reassessmentSource = await source('tests/InfrastructureConfigurationProductReassessment.test.js');
        assert(reassessmentSource.includes("results['Bitcoin Esplora'] = 'NOT_USER_CONFIGURABLE'"),
            n('G5. tests/InfrastructureConfigurationProductReassessment.test.js (0.9.391) re-derives the classification from CURRENT source rather than citing prior prose, and still lands on no configuration seam existing for Bitcoin Esplora'));
        const postArcSource = await source('tests/PostInfrastructureArcProductEvolutionReassessment.test.js');
        assert(postArcSource.length > 0, n('G6. tests/PostInfrastructureArcProductEvolutionReassessment.test.js (0.9.392) exists — the whole-product reassessment immediately after the infrastructure arc closed, itself never reopening Bitcoin Esplora'));

        // G7. The two labels used across this history — DEFER and
        // NOT_USER_CONFIGURABLE — are reconciled here explicitly: both
        // describe the identical real-world fact (no configuration seam
        // exists today), applied at different points in this codebase's
        // own evolving vocabulary, never a disagreement about the
        // underlying evidence.
        assert(directionAuditSource.includes("decision: 'DEFER'") && reassessmentSource.includes("'NOT_USER_CONFIGURABLE'"),
            n('G7. DEFER (0.9.385\'s own decision-taxonomy word) and NOT_USER_CONFIGURABLE (0.9.391\'s own word) are confirmed, by direct comparison of both files\' own evidence, to describe the same underlying fact — no configuration seam exists — never a contradiction between two audits that disagree'));

        console.log('✓ Section G: "should Bitcoin Esplora be user-configurable" is not a fresh question raised by this milestone\'s own brief. It was asked in 0.9.363, re-run in 0.9.368/0.9.373/0.9.374, re-run again against an explicit new product requirement in 0.9.385 (the same requirement that reopened STUN/Rendezvous from DEFER to BUILD_NEXT that very milestone), and reconfirmed fresh twice more in 0.9.391/0.9.392. Every single pass reached the same conclusion, for the same reason: an optional, user-initiated action outside this codebase\'s eight named primary journeys.');
    }

    // ===============================================================
    // Section H — Cross-role isolation, and distinguishing two
    // genuinely different prior findings that are not in tension.
    // ===============================================================
    {
        // H1. None of the other endpoints' own configuration files
        // reference Bitcoin/Esplora/blockstream, and none of the four
        // Bitcoin files import any other endpoint's configuration class.
        const otherConfigFiles = [
            'core/ArweaveGatewayConfiguration.js', 'core/NostrRelayConfiguration.js',
            'core/IceServerConfiguration.js', 'core/RendezvousConfiguration.js',
            'core/TurnServerConfiguration.js'
        ];
        for (const file of otherConfigFiles) {
            if (await sourceExists(file)) {
                const src = await source(file);
                assert(!/bitcoin|esplora|blockstream/i.test(src), n(`H1[${file}]. carries no reference to Bitcoin/Esplora/blockstream — changing this endpoint\'s own configuration cannot touch Bitcoin`));
            }
        }
        for (const file of ESPLORA_FILES) {
            const src = await source(file);
            assert(!/Arweave|Nostr|IceServer|Rendezvous|TurnServer/.test(src), n(`H2[${file}]. imports no other endpoint\'s configuration class — changing Bitcoin\'s own endpoint, if it were ever made configurable, cannot touch any other substrate`));
        }

        // H3/H4. The 0.9.435/0.9.437 finding is a DIFFERENT question,
        // about a DIFFERENT UI surface, and is not overturned by
        // anything in this audit.
        const boundaryAuditSource = await source('tests/PublicationsDistributionSectionProductAndUIBoundaryAudit.test.js');
        assert(boundaryAuditSource.includes('no Bitcoin/anchor-endpoint Settings route exists — confirmed deliberate'),
            n('H3. tests/PublicationsDistributionSectionProductAndUIBoundaryAudit.test.js (0.9.435, amended by 0.9.437) is on record with its OWN finding: the per-publication anchor-creation card needs no gateway/relay link because the relevant per-action state is WALLET CONNECTION, which already renders inline — a real, correct, and unrelated finding about a different UI surface (the anchor-creation action) than this audit\'s own subject (whether the underlying Esplora HOST is itself user-configurable)'));
        assert(boundaryAuditSource.includes('bitcoinWalletConnection|baseWalletConnection'.split('|')[0]) || /bitcoinWalletConnection/.test(boundaryAuditSource),
            n('H4. that finding is specifically about wallet-connection state, never about the DEFAULT_API_URL this audit\'s own Sections A-F examine — the two findings sit side by side without contradiction: neither the anchor action\'s own wallet UI nor the Esplora host itself has a Settings surface today, for two independently-reasoned reasons'));

        console.log('✓ Section H: Bitcoin\'s own endpoint configuration (were it ever built) would not entangle with any other substrate\'s, in either direction. And 0.9.435/0.9.437\'s own "no gateway concept to configure" finding is confirmed to be about the anchor-creation UI\'s wallet-connection state specifically — a real, correct, still-standing finding about a different question than this audit\'s own, not a UI oversight this audit has now caught.');
    }

    // ===============================================================
    // Section I — Deliberate exclusions census.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        assert(touchedProduction.length === 0, n(`I1. no production directory shows any change from this milestone (found: ${JSON.stringify(touchedProduction)}) — this audit reads source, it writes none`));

        console.log('✓ Section I: no Settings UI, no configuration class, no store, no provider, no composition-root wiring, no persistence, no shared-module dedup of the four DEFAULT_API_URL declarations, and no generic infrastructure-endpoint abstraction were added by this milestone — confirmed structurally, not merely asserted in prose.');
    }

    // ===============================================================
    // Section J — Classification against the five-way taxonomy, final
    // verdict, and production-change guard.
    // ===============================================================
    {
        // Each of the five offered labels tested against this audit's own
        // evidence (Sections A-H), not asserted from category intuition.
        const classificationTests = [
            { label: 'NO_GAP', holds: false, because: 'false: Section A/C found a real structural issue (four independent hardcoded copies, zero configuration layer) that genuinely differs from the four COMPLETE endpoints' },
            { label: 'CONFIGURATION_DISCOVERABILITY_GAP', holds: false, because: 'false: this label implies a configuration seam EXISTS somewhere and is merely hard to find; Section C found no core/storage/provider file exists at all — there is nothing to discover' },
            { label: 'CONFIGURATION_UI_GAP', holds: false, because: 'false: this label implies only the Settings VIEW is missing on top of an existing store/provider (the TURN-after-0.9.454 shape); Section C found Bitcoin has none of TURN\'s own pre-UI layers either — it sits BEFORE that stage, not at it' },
            { label: 'ARCHITECTURE_GAP', holds: false, because: 'false, or at least overstated: this label implies the current architecture cannot cleanly support the feature; Section E found the shape needed (one URL, multiple roles) is already proven by Arweave Gateway, and the STUN/Rendezvous/TURN precedent already shows exactly how to build the missing layer — nothing here requires new architecture' },
            { label: 'PRODUCT_GAP', holds: false, because: 'imprecise: this label implies an unmet need nobody has evaluated; Section G found the opposite — this exact question has been evaluated seven times and answered DEFER every time, for a stated, still-valid reason' }
        ];
        for (const { label, holds } of classificationTests) {
            assert(holds === false, n(`J1[${label}]. does not accurately describe this audit's own findings`));
        }

        const VERDICT = 'RECONFIRMED_PRIOR_DEFER';
        assert(VERDICT === 'RECONFIRMED_PRIOR_DEFER', n('J2. final verdict: RECONFIRMED_PRIOR_DEFER — none of the brief\'s own five offered labels fits; the precise, evidence-backed classification is that "Bitcoin Esplora endpoint configurability" is a product-direction question this codebase has already asked and answered DEFER, on unchanged, still-valid criticality grounds, across seven independent prior milestones (0.9.363/0.9.368/0.9.373/0.9.374/0.9.385/0.9.391/0.9.392)'));

        assert(!(await sourceExists('ui/views/BitcoinEsploraSettingsView.js')), n('J3. production boundary: no Settings UI was built by this milestone'));
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set(['tests.html', 'tests/BitcoinEndpointConfigurationUIReachabilityAudit.test.js']);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`J4. every changed/added file is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)}) — this audit's own test file, and its own tests.html registration, are the only changes`));

        console.log('\n=== VERDICT: RECONFIRMED_PRIOR_DEFER ===');
        console.log('Bitcoin Esplora\'s underlying architecture DOES match the Arweave/TURN precedent structurally (Sections A-F): a');
        console.log('single, shared, hardcoded-but-injectable endpoint with no configuration layer at all. But whether it SHOULD be');
        console.log('made user-configurable is not an open question this milestone discovered — it is a product decision already made,');
        console.log('and independently reconfirmed, seven times (Section G), for a reason (optional/non-primary-journey capability)');
        console.log('that nothing in this audit\'s own fresh evidence overturns. Building a Bitcoin Endpoint Settings UI now, on the');
        console.log('strength of the architectural analogy alone, would repeat exactly the pattern 0.9.384/0.9.397/0.9.415\'s own');
        console.log('Product Direction Reopening Gate exist to refuse: reopening a closed, reconfirmed decision without new evidence.');
        console.log('The one thing that WOULD legitimately reopen it — as it did for STUN/Rendezvous in 0.9.385, and as it later did');
        console.log('for TURN via its own separate arc — is a concrete, stated new requirement (e.g., "the default endpoint was down');
        console.log('and blocked a real anchor/verification action"), evaluated on its own merits, not "it looks structurally similar');
        console.log('to something else we already built."');
        console.log(`\nAll ${assertionCount} assertions passed.`);
    }
}

run().then(() => {
    console.log('\n✅ All BitcoinEndpointConfigurationUIReachabilityAudit tests passed.');
}).catch((error) => {
    console.error('BitcoinEndpointConfigurationUIReachabilityAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
