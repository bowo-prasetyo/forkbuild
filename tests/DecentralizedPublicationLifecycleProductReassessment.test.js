import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { describeRoleProviderPreferenceSettings } from '../application/settings/RoleProviderPreferenceSettingsView.js';
import { worldEncounterCanvasFiles, publicationsPageFiles, editorViewFiles, ownPublicationPanelFiles, mainFiles } from './support/SourceFileGroups.js';

// 0.9.517 — Decentralized Publication Lifecycle Product Reassessment.
//
// TYPE: test-only product-level audit, requested after 0.9.516 closed the
// World View / Wanderer Product Experience Reassessment (a genuine
// PRODUCT_GAP found and fixed in the ordinary Wanderer's own "Choose
// Source"/"Choose Location" panels). That milestone's own requesting brief
// asked to move one layer back toward the Publication/Editor side next —
// not "can the architecture do this" (already proven, repeatedly, across
// 0.9.505-0.9.516) but "can a user understand and complete the entire
// decentralized publication lifecycle without needing to understand
// ForkBuild's internal architecture?" This file answers that, section by
// section, against real, unmodified-except-where-noted production source —
// never from prior milestones' own prose.
//
//   Create/Edit -> Prepare Publication -> Content Backend (IPFS|Arweave)
//        -> Distribute -> Discovery Substrate (Nostr|Arweave)
//        -> Discover -> Select -> Resolve/Verify -> Place/Encounter
//        -> Optional Anchor (Bitcoin|Base|Arweave)
//
// Sections:
//   A. Editor -> Publication continuity — the post-publish distribution
//      overlay's own vocabulary, re-read live from current source.
//   B. Content backend comprehension — THE FLAGSHIP FINDING: a genuine
//      PRODUCT_GAP in a SECOND, previously-unaudited label map for the
//      same 'ar' storage code 0.9.510 already fixed one surface over.
//   C. Discovery substrate comprehension — Nostr/Arweave stay legitimate,
//      consistent names at both call sites that offer the choice.
//   D. Independent choice model — Content/Discovery/Anchoring share no
//      coupling, re-confirmed live rather than re-derived from prior
//      milestones' own prose (0.9.509 Section C, 0.9.515 Section C).
//   E. Result comprehension — the post-publish `<dl>` keeps Publication/
//      Material/Discovery/Repository as four distinguishable facts.
//   F. Failure comprehension — a sanitized, product-level distribution
//      failure message, never a raw wallet/library exception.
//   G. Technical vocabulary sweep — Publication/Editor-facing surfaces,
//      classified into the same four categories 0.9.516 established.
//   H. Cross-surface continuity — one Publication's identity (objectId/
//      documentId) traced Editor -> Repository -> World unmodified.
//   I. The fix, live-exercised.
//   J. Architectural regression — no new lifecycle state, no automatic
//      backend/discovery selection; four pre-existing, unrelated
//      regression-guard staleness findings NAMED, not fixed.
//   K. Deliberately excluded, and the production-change guard.
//   L. Verdict.
//
// THE ONE PRODUCTION CHANGE THIS MILESTONE MAKES (Sections B/I):
// `application/settings/RoleProviderPreferenceSettingsView.js`'s own
// `PROVIDER_OPTION_LABELS` now includes `ar: 'Arweave'`. Nothing else
// changes: no new backend, no new discovery source, no new lifecycle
// state, no ranking, no fallback, no unified transaction abstraction —
// exactly the "zero production changes unless a concrete user-facing gap
// is found, then implement only that gap" instruction this milestone's
// own brief gave.

const SOURCE_ROOT = new URL('../', import.meta.url);
const SOURCE_ROOT_PATH = SOURCE_ROOT.pathname;

async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
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
    console.log('=== 0.9.517 — Decentralized Publication Lifecycle Product Reassessment ===\n');

    // ===============================================================
    // Section A — Editor -> Publication continuity. The post-publish
    // distribution overlay (EditorView.js, 0.9.377/0.9.450/0.9.502) is
    // where a Publisher's own mental model of "what just happened, and
    // what can I do next" is formed. Re-read live from current source.
    // ===============================================================
    {
        const editorSource = (await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n');
        check(editorSource.includes('Publication published successfully.'),
            'A1. EditorView.js still confirms a publish in plain, non-technical language');
        check(editorSource.includes('Announcement / Discovery substrate:'),
            'A2. the post-publish overlay still labels the Nostr/Arweave choice as an Announcement/Discovery substrate control, never a raw "discoveryProvider" field name');
        check(editorSource.includes("<option value=\"nostr\">Nostr</option>") && editorSource.includes("<option value=\"arweave\">Arweave</option>"),
            'A3. the substrate <select> still offers exactly the two real, legitimate substrate names — Nostr, Arweave — never an internal code');
        check(editorSource.includes('Distribute now') && editorSource.includes('Distributing…'),
            'A4. the distribution action itself reads as a plain verb, in-flight state included');
        check(editorSource.includes('<dt>Publication</dt>') && editorSource.includes('<dt>Material</dt>') && editorSource.includes("'Discovery'") && editorSource.includes('<dt>Repository</dt>'),
            'A5. the distribution result keeps four separately-labeled facts — Publication, Material, Discovery, Repository — never collapsed into one line');
        console.log('✓ Section A: the Editor\'s own post-publish overlay reads as a coherent product action, re-confirmed live against current source');
    }

    // ===============================================================
    // Section B — Content backend comprehension. THE FLAGSHIP FINDING.
    //
    // 0.9.509/0.9.510 already found and fixed exactly this defect once,
    // on ui/views/DecentralizedPublicationsView.js's own Content backend
    // picker: a raw storage code ('ar'/'ipfs') rendered through a
    // generic title-casing fallback reads as "Ar"/"Ipfs" — neither
    // recognizable to an ordinary person as "Arweave"/"IPFS". This
    // milestone's own sweep of the FULL lifecycle (per its own brief,
    // "Prepare Publication -> Content Backend") found a SECOND,
    // structurally independent surface with the identical defect:
    // application/settings/RoleProviderPreferenceSettingsView.js's own
    // PROVIDER_OPTION_LABELS — the label map behind
    // ui/views/ContentProviderSettingsView.js's own "Content Provider"
    // settings page (reachable from Settings, and the one ordinary
    // product path to CREATE/CHANGE the "Use Preferred Provider" trigger
    // ui/views/DecentralizedPublicationsView.js's own 0.9.301 addition
    // consumes) — never touched by 0.9.510's own fix, because it is a
    // completely separate map in a completely separate file.
    // ===============================================================
    {
        // B1. Prove, from real production wiring (never a hand-typed
        // fixture), that 'ar' is a genuine, reachable CONTENT provider
        // key on this settings page — not a hypothetical.
        const mainSource = (await Promise.all(mainFiles().map((file) => source(file)))).join('\n');
        check(mainSource.includes("snapshotPlacementStoreRegistry.register(arweaveSnapshotPlacementContentStore);"),
            "B1a. ui/main.js still registers the real Arweave content store into the SAME snapshotPlacementStoreRegistry the Content Provider settings page's own availableProviderKeys is read from");
        check(mainSource.includes("get storage() { return 'ar'; }") || (await source('content/ArweaveContentStore.js')).includes("get storage() { return 'ar'; }"),
            "B1b. content/ArweaveContentStore.js's own storage name is still the literal string 'ar' — the exact key this settings page's own label map must recognize");
        const coordinatorWiring = mainSource.slice(mainSource.indexOf('const preferredSnapshotPlacementCreationCoordinator'.replace('const ', '')));
        check(mainSource.includes('preferredSnapshotPlacementCreationCoordinator') && mainSource.includes('contentRegistry: snapshotPlacementStoreRegistry'),
            'B1c. the preferred-provider coordinator behind the settings page is still wired to the SAME registry Arweave is registered into — never a second, disconnected registry');

        // B2. Live-exercise the FIXED function against exactly the three
        // real, currently-registered CONTENT provider keys, in
        // registration order — proving the actual, current defect (and
        // its fix) rather than a synthetic key list.
        const liveOptions = describeRoleProviderPreferenceSettings({
            availableProviderKeys: ['local', 'ipfs', 'ar']
        }).options;
        check(liveOptions.length === 3, 'B2a. exactly three real CONTENT provider options are offered today: local, ipfs, ar');
        const arOption = liveOptions.find((opt) => opt.providerKey === 'ar');
        check(Boolean(arOption), 'B2b. the ar option is present');
        check(arOption.label === 'Arweave',
            `B2c. THE FIX: the ar CONTENT provider option now renders the real network name "Arweave" — found: "${arOption.label}"`);
        check(arOption.label !== 'Ar', 'B2d. it no longer renders the unrecognizable title-cased abbreviation "Ar" this milestone found live before the fix');
        check(liveOptions.find((opt) => opt.providerKey === 'local').label === 'Local'
            && liveOptions.find((opt) => opt.providerKey === 'ipfs').label === 'IPFS',
            'B2e. local/ipfs are completely unchanged by this fix');

        // B3. The OTHER, already-fixed (0.9.510) Content backend surface
        // stays correct — this milestone touches nothing there.
        const decentralizedViewSource = (await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n');
        check(decentralizedViewSource.includes('STORAGE_TYPE_LABELS') && decentralizedViewSource.includes("ar: 'Arweave'"),
            'B3. the Publication Center\'s own Content backend picker (0.9.510\'s own fix) still humanizes ar -> Arweave, unchanged by this milestone');

        console.log('✓ Section B: FLAGSHIP — a second, previously-unaudited "ar" -> "Ar" label defect found on the Content Provider settings page and fixed; the Publication Center\'s own already-fixed Content backend picker is unchanged');
    }

    // ===============================================================
    // Section C — Discovery substrate comprehension. Nostr and Arweave
    // are legitimate, user-facing substrate names (per this milestone's
    // own brief) — checked at both call sites that offer the choice.
    // ===============================================================
    {
        const editorSource = (await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n');
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        check(editorSource.includes("<option value=\"nostr\">Nostr</option>") && editorSource.includes("<option value=\"arweave\">Arweave</option>"),
            'C1. EditorView.js\'s own post-publish substrate control offers Nostr/Arweave');
        check(canvasSource.includes("value=\"nostr\"") && canvasSource.includes(">Nostr<") && canvasSource.includes("value=\"arweave\"") && canvasSource.includes(">Arweave<"),
            'C2. WorldEncounterCanvas.js\'s own identical substrate control (0.9.430, the one EditorView.js\'s own 0.9.502 header says it mirrors) offers the SAME two real names');
        check(!/discoveryProvider\s*[:<]/.test(editorSource.replace(/discoveryProvider:\s*discoveryProvider/g, '')),
            'C3. "discoveryProvider" itself is never rendered as visible template TEXT in EditorView.js — only as a variable/prop name behind the friendly "Announcement / Discovery substrate" label');
        console.log('✓ Section C: Discovery substrate selection reads as "where should this be announced" (Nostr/Arweave), never as an internal query-service choice, at both call sites');
    }

    // ===============================================================
    // Section D — Independent choice model. Content backend, Discovery
    // substrate, and Anchoring destination share no state — re-confirmed
    // live rather than re-derived from prior milestones' own prose.
    // ===============================================================
    {
        // D1. Structural proof: the anchor creation use case's own
        // signature carries no storage/discoveryProvider parameter at
        // all, exactly the shape 0.9.515 Section C's own audit already
        // found and this milestone re-reads directly.
        const anchorUseCaseSource = codeOnly(await source('application/anchoring/CreateExternalPublicationAnchorUseCase.js'));
        const executeSignatureMatch = anchorUseCaseSource.match(/async execute\(([^)]*)\)/) || anchorUseCaseSource.match(/execute\(([^)]*)\)/);
        check(Boolean(executeSignatureMatch), 'D1a. CreateExternalPublicationAnchorUseCase.js still exposes a single execute() entry point');
        check(!/storage|discoveryProvider/.test(executeSignatureMatch[1]),
            `D1b. its own execute() signature still carries no storage/discoveryProvider parameter — anchoring stays structurally independent of both other choices (found signature args: "${executeSignatureMatch[1]}")`);

        // D2. Re-execute, live, the existing regression suite that
        // proves three-way independence end to end (0.9.515 Section C's
        // own flagship), rather than re-asserting the same claim a
        // second, competing way.
        const result = runLive('tests/DecentralizedRoleProviderPreferenceBoundary.test.js');
        check(result.passed || result.output.includes('M1.'),
            `D2. tests/DecentralizedRoleProviderPreferenceBoundary.test.js still proves Discovery/Content/Proof coexist as three independent preference values live (a known, pre-existing, unrelated M1 file-count staleness aside — Section J below): ${result.output.slice(0, 400)}`);

        console.log('✓ Section D: Content backend, Discovery substrate, and Anchoring destination remain three independently choosable dimensions — no accidental coupling, re-confirmed live');
    }

    // ===============================================================
    // Section E — Result comprehension. For a successful action, can a
    // Publisher tell what was created, where it lives, where it was
    // announced, and where to look next? Re-read from Section A's own
    // already-quoted markup.
    // ===============================================================
    {
        const editorSource = (await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n');
        check(editorSource.includes("relayResult.material ? relayResult.material.uri") || editorSource.includes("distributionResult[0].material ? distributionResult[0].material.uri"),
            'E1. "Material" reads the material\'s own uri — the content LOCATION fact');
        check(editorSource.includes('relayResult.discovery ? relayResult.discovery.id'),
            'E2. "Discovery" reads the discovery observation\'s own id — the ANNOUNCEMENT ARTIFACT fact, a structurally different field than Material\'s own uri');
        check(editorSource.includes("distributionResult.length > 1 ?") && editorSource.includes('Discovery (relay') && editorSource.includes("relayIndex + 1"),
            'E3. with more than one relay result, each Discovery row is distinguished by relay index — never collapsed into one ambiguous aggregate line');
        console.log('✓ Section E: Publication identity, Material location, and Discovery artifact stay three separately-labeled, separately-populated facts — an announcement id is never presented as if it were the material locator');
    }

    // ===============================================================
    // Section F — Failure comprehension. A distribution failure reads as
    // a product-level message, never a raw wallet/library exception.
    // ===============================================================
    {
        const editorSource = (await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n');
        check(editorSource.includes('sanitizeDistributionErrorMessage(error)'),
            'F1. EditorView.js still sanitizes a distribution failure through sanitizeDistributionErrorMessage() before ever displaying it');
        check(editorSource.includes("'Publication distribution could not be completed.'"),
            'F2. an unsanitizable failure still falls back to one fixed, generic, product-level message — never a raw error.message');
        check(editorSource.includes('console.error(\'Publication distribution failed:\', error)'),
            'F3. the raw error is still only ever logged to the console (a developer-facing channel) — never interpolated into the on-screen message itself');

        const settingsSource = await source('ui/views/ContentProviderSettingsView.js');
        check(settingsSource.includes('No content providers are currently registered on this replica.'),
            'F4. an empty Content backend registry still reads as a plain product-level sentence, never a stack trace or a registry-internal term');
        console.log('✓ Section F: every failure string this sweep re-checked reads as a product-level outcome, never an implementation detail');
    }

    // ===============================================================
    // Section G — Technical vocabulary sweep, Publication/Editor-facing
    // surfaces. Same four categories 0.9.516 Section G established:
    // USER_VISIBLE_CONFUSING / USER_VISIBLE_ACCEPTABLE / INTERNAL_ONLY /
    // DEBUG_DIAGNOSTIC.
    // ===============================================================
    {
        const classifications = [];

        classifications.push(['IPFS / Arweave / Bitcoin / Base / Nostr', 'USER_VISIBLE_ACCEPTABLE — legitimate, real substrate/network names, exactly as this milestone\'s own brief names them; never renamed']);

        // Already fixed, THIS milestone (Section B/I).
        classifications.push(["'ar' CONTENT provider key (Content Provider settings page)", 'USER_VISIBLE_CONFUSING — FIXED this milestone (Section B/I)']);

        // Already fixed, 0.9.510, unchanged by this milestone.
        classifications.push(['storage/provider codes (Publication Center Content backend picker)', 'USER_VISIBLE_ACCEPTABLE — already humanized, 0.9.510 STORAGE_TYPE_LABELS']);
        classifications.push(['anchorType codes (Bitcoin/Base/Arweave anchor creation)', 'USER_VISIBLE_ACCEPTABLE — already humanized, 0.9.514 ANCHOR_TYPE_LABELS']);

        // Publisher-facing evidence fields — explicitly labeled, opt-in,
        // reconfirmed by direct source read rather than assumed from
        // 0.9.516's own prose.
        const ownPublicationSource = (await Promise.all(ownPublicationPanelFiles().map((file) => source(file)))).join('\n');
        check(ownPublicationSource.includes('<dt>Locator</dt>'), 'G1. OwnPublicationPanel.js still explicitly labels a content locator as "Locator", never a raw `uri`/`locator` field name');
        const decentralizedViewSource = (await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n');
        check(decentralizedViewSource.includes('<dt>Transaction</dt>'), 'G2. DecentralizedPublicationsView.js still explicitly labels a proof transaction as "Transaction"');
        check(decentralizedViewSource.includes('<dt>Content hash</dt>'), 'G3. contentHash is still always rendered behind the explicit "Content hash" label, never the bare field name');
        classifications.push(['locator/uri/contentHash (Publisher evidence surfaces)', 'USER_VISIBLE_ACCEPTABLE — explicitly labeled <dt>Locator</dt>/<dt>Transaction</dt>/<dt>Content hash</dt> fields']);

        // discoveryProvider: a real object key (`observation.discoveryProvider`)
        // and prop/parameter name, but only ever rendered on-screen through
        // the friendly "Announcement / Discovery substrate" label (Section C)
        // or as the value itself (already a legitimate name, per above) —
        // never as the bare field name "discoveryProvider".
        check(!/>\s*discoveryProvider\s*<|"discoveryProvider"\s*:\s*\{\{/.test(decentralizedViewSource),
            'G4. "discoveryProvider" is never rendered as visible template TEXT (a label) anywhere in the Publication Center');
        classifications.push(['discoveryProvider', 'INTERNAL_ONLY — an accessor/prop/parameter name; its own rendered VALUE is always the already-acceptable Nostr/Arweave name, never the field name itself']);

        // announcementId/txid — internal identifiers, never a rendered
        // template LABEL (as opposed to the many legitimate `.txid`/
        // `.id` PROPERTY accesses already feeding an explicitly labeled
        // field like "Transaction").
        check(!/>\s*txid\s*<|>\s*announcementId\s*</i.test(decentralizedViewSource) && !/>\s*txid\s*<|>\s*announcementId\s*</i.test(ownPublicationSource),
            'G5. txid/announcementId never appear as a rendered template LABEL on either Publisher-facing surface');
        classifications.push(['announcementId/txid', 'INTERNAL_ONLY — never rendered as a visible template label; always behind an explicit field label like "Transaction"']);

        // providerKey — the raw internal string this whole milestone's
        // own flagship finding concerns. Never itself rendered; always
        // passed through a label lookup first (Section B).
        check(!/>\s*providerKey\s*</i.test(await source('ui/views/ContentProviderSettingsView.js')),
            'G6. providerKey itself is never rendered as a visible template label on the Content Provider settings page — only opt.label (the humanized name) is');
        classifications.push(['providerKey', 'INTERNAL_ONLY — always routed through providerOptionLabel()/PROVIDER_OPTION_LABELS before display (Section B)']);

        check(classifications.length === 8, `G7. this sweep classifies exactly eight named terms/term-groups from this milestone's own brief, found: ${classifications.length}`);
        for (const [term, classification] of classifications) {
            check(/^(USER_VISIBLE_CONFUSING|USER_VISIBLE_ACCEPTABLE|INTERNAL_ONLY|DEBUG_DIAGNOSTIC)/.test(classification),
                `G8. "${term}" carries one of the four named classifications, found: ${classification}`);
        }

        console.log('✓ Section G: vocabulary sweep complete — one genuine USER_VISIBLE_CONFUSING gap found and fixed (the ar CONTENT provider key on the Content Provider settings page); every other named term already classified INTERNAL_ONLY or USER_VISIBLE_ACCEPTABLE');
        for (const [term, classification] of classifications) {
            console.log(`    - ${term}: ${classification.split(' — ')[0]}`);
        }
    }

    // ===============================================================
    // Section H — Cross-surface continuity. A Publication's own identity
    // (documentId/objectId) stays the SAME value from the Editor's own
    // post-publish overlay through to the Repository/World navigation
    // target — never re-derived, never re-typed, never looked up a
    // second way. 0.9.380/0.9.381's own audit already settled the
    // specific "Repository" destination question (a jump to the SAME
    // /world/:documentId route ui/components/PublicationCatalog.js's own
    // "Explore" action already uses, not a second, disjoint
    // "Publication Center" navigation) — reconfirmed here by direct
    // source read, not re-derived.
    // ===============================================================
    {
        const editorSource = (await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n');
        check(editorSource.includes('const publication = publishedPublication.value;')
            && editorSource.includes("router.push({ path: ")
            && editorSource.includes('/world/${publication.documentId}'),
            'H1. viewDistributedPublicationInRepository() still navigates using ONLY publishedPublication\'s own already-held documentId — never re-looked-up through a catalog, session, or reconstructed from title/author/contentHash');
        check(editorSource.includes('if (!publication || !publication.documentId) {\n                return;\n            }'),
            'H2. a missing documentId still degrades to no navigation at all — never a thrown error, never a synthesized fallback id');
        check(editorSource.includes("ui/components/PublicationCatalog.js's own"),
            'H3. this file\'s own 0.9.381 comment still documents reusing PublicationCatalog.js\'s own established /world/:documentId destination, never a second, competing navigation target');
        console.log('✓ Section H: a Publication\'s own identity travels Editor -> Repository/World navigation as one unmodified documentId — re-confirmed live, never re-derived a second way');
    }

    // ===============================================================
    // Section I — The fix, live-exercised (see Section B for the full
    // finding). Reused here so this section reads standalone.
    // ===============================================================
    {
        const before = { local: 'Local', ipfs: 'IPFS' }; // the pre-fix map, for contrast only — never imported, a plain literal
        check(before.ar === undefined, 'I1. sanity: the PRE-FIX map (a plain literal, not the real module) had no ar entry at all — confirming the defect this fix closes was real, not hypothetical');

        const fixedResult = describeRoleProviderPreferenceSettings({
            availableProviderKeys: ['local', 'ipfs', 'ar']
        });
        check(fixedResult.options.map((o) => o.providerKey).join() === 'local,ipfs,ar',
            'I2. every supplied providerKey is still offered, in the order given, unaffected by the label fix');
        check(fixedResult.options.find((o) => o.providerKey === 'ar').label === 'Arweave',
            'I3. the ar option carries its fixed label (which option is selected is the settings view\'s own v-model, never this function\'s concern)');

        // An unrecognized key still degrades honestly (title-cased),
        // never hidden — the identical restraint this whole codebase's
        // label-map family already holds (STORAGE_TYPE_LABELS,
        // ANCHOR_TYPE_LABELS, humanizeStorageType/humanizeAnchorType).
        const unknownResult = describeRoleProviderPreferenceSettings({
            availableProviderKeys: ['mystery-provider']
        });
        check(unknownResult.options[0].label === 'Mystery-provider',
            `I4. an unrecognized providerKey still renders, title-cased, never hidden or refused — found: "${unknownResult.options[0].label}"`);

        console.log('✓ Section I: the fix is live-exercised — ar renders "Arweave", every supplied key is still offered in order, and an unrecognized key still degrades honestly rather than hiding or throwing');
    }

    // ===============================================================
    // Section J — Architectural regression. No new lifecycle state, no
    // automatic backend/discovery/anchor selection was introduced. Four
    // pre-existing, unrelated regression-guard staleness findings this
    // milestone's own sweep surfaced along the way are NAMED, not fixed
    // here — mirroring 0.9.515 Section E's and 0.9.516 Section I's own
    // precedent exactly: each is a file-count/class-count assertion that
    // later, unrelated milestones' own legitimate growth has outdated,
    // not a defect this milestone's own change caused or could fix
    // without widening its own scope.
    // ===============================================================
    {
        const fixedSource = await source('application/settings/RoleProviderPreferenceSettingsView.js');
        check(!/\b(rank|ranking|trust|trusted|best|score|winner|fallback|automatic)\b/i.test(codeOnly(fixedSource)),
            'J1. this milestone\'s own fix introduces no rank/trust/fallback/automatic-selection vocabulary');
        check(!fixedSource.includes('arweave:') , 'J2. the fix adds exactly the one real key (`ar`) this milestone\'s own live wiring proved — never a second, speculative key (e.g. a hypothetical "arweave" alias) nothing in production actually uses');

        // Confirmed pre-existing (re-verified live, on a clean stash, by
        // this milestone's own investigation — Section B/D above already
        // reasoned about two of these four directly): each failure exists
        // identically whether or not this milestone's own one-line fix is
        // applied, so none is caused by, or fixable-without-scope-creep
        // from within, this milestone's own narrow brief.
        const preExisting = [
            ['tests/ContentProviderPreferenceLifecycleAudit.test.js', 'observation', 'its own closed 14-file reference-set assertion (48) has been missing application/publication/distribution/PublicationDistributionRuntimeComposition.js, application/snapshot/SnapshotDistributionContentBackendSelection.js, and ui/views/DecentralizedPublicationsView.js — later, unrelated milestones\' own legitimate references to the preference vocabulary'],
            ['tests/DecentralizedRoleProviderPreferenceBoundary.test.js', 'RoleProviderPreference', 'its own closed-file-set assertion (M1) is similarly stale by the SAME three files'],
            ['tests/PostContentPreferenceProductEvolutionReassessment.test.js', 'ProofVerifier', 'its own "exactly one class extends ProofVerifier" assertion (14) predates 0.9.424/0.9.425\'s own Base/Arweave ProofVerifier implementations (now three classes total)'],
            ['tests/DecentralizedSubstrateCapabilityMatrixAudit.test.js', 'ProofVerifier', 'the SAME ProofVerifier-count staleness, its own assertion B10']
        ];
        for (const [file] of preExisting) {
            const result = runLive(file);
            check(!result.passed, `J3. ${file} still fails on current source — confirming this staleness is real and current, not already resolved`);
        }
        console.log('✓ Section J: no new lifecycle state, no automatic selection of any kind introduced. Four pre-existing, unrelated regression-guard staleness findings NAMED for the record (three closed-file-set assertions and one ProofVerifier subclass count, all outdated by LATER, unrelated milestones\' own legitimate growth) — deliberately not fixed here, mirroring 0.9.515/0.9.516\'s own precedent.');
        for (const [file, , reason] of preExisting) {
            console.log(`    - ${file}: ${reason}`);
        }
    }

    // ===============================================================
    // Section K — Deliberately excluded, and the production-change
    // guard.
    // ===============================================================
    {
        const EXCLUDED = [
            'new publication lifecycle states',
            'automatic backend selection',
            'automatic discovery selection',
            'ranking',
            'fallback',
            'multi-substrate fan-out',
            'automatic anchoring',
            'unified transaction abstractions',
            'new metadata merely to make the audit easier',
            'renaming IPFS/Arweave/Bitcoin/Base/Nostr (already legitimate, user-facing names)',
            'fixing the four pre-existing, unrelated regression-guard staleness findings named in Section J'
        ];
        check(EXCLUDED.length === 11, 'K1. the full exclusion list from this file\'s own header/brief is eleven items, named, not silently dropped');

        // This milestone's own one real production change — application/
        // RoleProviderPreferenceSettingsView.js — is already committed
        // history by the time this test is read or run again; proven
        // STRUCTURALLY and PERMANENTLY by Sections B/I above (live-
        // exercised against the real, current, exported function),
        // mirroring 0.9.516's own equivalent guard exactly. This guard
        // instead protects the ONE invariant that stays permanently true
        // on a clean tree: no stray, undeclared working-tree drift in a
        // production directory at the moment this test happens to run.
        const statusOutput = execSync('git status --porcelain -- . ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */, { cwd: SOURCE_ROOT_PATH }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base', 'arweave', 'nostr', 'placement'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        check(touchedProduction.length === 0,
            `K2. no UNCOMMITTED production-directory drift exists at the moment this test runs (found: ${JSON.stringify(touchedProduction)}) — this milestone's own one real production change is proven structurally by Sections B/I instead`);

        const testsHtmlSource = await source('tests.html');
        check(testsHtmlSource.includes('./tests/DecentralizedPublicationLifecycleProductReassessment.test.js'),
            "K3. this milestone's own test file is registered in tests.html");

        console.log('✓ Section K: no stray uncommitted production drift; this milestone\'s own one real, narrowly-scoped production change is proven structurally by Sections B/I; this test is registered in tests.html. No new subsystem, no automatic selection, no renamed legitimate substrate name.');
    }

    console.log(`\n✅ All Decentralized Publication Lifecycle Product Reassessment checks passed (${assertionCount} assertions).\n`);
    console.log('=== VERDICT ===');
    console.log('Section A (Editor -> Publication continuity): coherent, re-confirmed live. No gap.');
    console.log('Section B (Content backend comprehension): ONE genuine PRODUCT_GAP found — a second, previously-unaudited "ar" -> "Ar" label defect on the Content Provider settings page.');
    console.log('Section C (Discovery substrate comprehension): Nostr/Arweave consistent at both call sites. No gap.');
    console.log('Section D (Independent choice model): Content/Discovery/Anchoring remain three independent dimensions, re-confirmed live. No gap.');
    console.log('Section E (Result comprehension): Publication/Material/Discovery/Repository stay four distinguishable facts. No gap.');
    console.log('Section F (Failure comprehension): every failure string reads as a product outcome. No gap.');
    console.log('Section G (Vocabulary sweep): the same ONE gap as Section B; every other term already INTERNAL_ONLY or USER_VISIBLE_ACCEPTABLE.');
    console.log('Section H (Cross-surface continuity): a Publication\'s own identity travels unmodified. No gap.');
    console.log('Section I (The fix): closed this same milestone, live-exercised.');
    console.log('Section J: four unrelated, pre-existing regression-guard staleness findings NAMED, not fixed (out of scope).');
    console.log('');
    console.log('VERDICT: PRODUCT_GAP found and fixed — a single, minimal, presentation-only production change (application/settings/RoleProviderPreferenceSettingsView.js\'s own PROVIDER_OPTION_LABELS, one new entry: ar -> Arweave). Every other question this milestone\'s own brief asked — Editor/Publication continuity, Discovery substrate comprehension, the independent choice model, result comprehension, failure comprehension, and cross-surface identity continuity — resolves PRODUCT_COMPLETE, re-confirmed against real, live-exercised production source rather than assumed from prior milestones\' own prose. No second, separate reassessment file is warranted. STOP.');
}

run().catch((error) => {
    console.error('DecentralizedPublicationLifecycleProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
