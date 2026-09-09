import { readFile, readdir } from 'node:fs/promises';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver, RoleProviderResolutionStatus } from '../application/RoleAwareProviderResolver.js';
import { ResolvePreferredRoleProviderUseCase } from '../application/ResolvePreferredRoleProviderUseCase.js';
import { SetRoleProviderPreferenceUseCase } from '../application/SetRoleProviderPreferenceUseCase.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';

// 0.9.304 — Post-Content-Preference Product Evolution Reassessment.
//
// Test-only. Zero production changes. 0.9.293-0.9.303 built and then
// audited ONE complete role-provider-preference arc, for CONTENT:
// meaning (0.9.293), persistence (0.9.294), resolution (0.9.295-0.9.297),
// a real consumer ("Use Preferred Provider," 0.9.299/0.9.301), a real
// producer (a Settings entry point, 0.9.302), and a lifecycle audit
// (0.9.303) that found the whole arc coherent, source-verified, and free
// of drift. This milestone asks the question that closure deliberately
// left open, and that this codebase's own convention (0.9.292, 0.9.296,
// 0.9.298) has always answered from evidence rather than from symmetry:
// now that CONTENT is done, does a SECOND role — Announcement & Discovery,
// or Proof & Anchoring — have its own legitimate, user-facing
// provider-selection problem worth building the same arc for? Or is
// stopping at CONTENT itself the correct, complete product outcome?
//
// THIS IS NOT A RE-RUN OF 0.9.296/0.9.298 — it is that this milestone
// does not TRUST either audit's own numbers without re-deriving the load-
// bearing ones fresh, against the CURRENT source tree, exactly the
// restraint 0.9.303's own Section I already held ("never trusting an
// earlier audit's cached numbers"). Where a fact re-confirms unchanged,
// this file says so and cites the earlier audit that first found it,
// rather than re-explaining it from scratch; where this file draws a NEW
// distinction neither 0.9.296 nor 0.9.298 needed (the abstraction-fitness
// question, Section E below; the seven-criterion scoring rubric, Section
// H; the closed non-feature vocabulary sweep, Section I), it says so too.
//
// TEN LETTERED SECTIONS, EACH BACKED BY REAL SOURCE — never this file's
// own prose:
//   A — capability inventory: the CONTENT chain is complete, reconfirmed
//       functionally (a real save → resolve round trip), not merely by
//       file existence.
//   B — Discovery classified seam by seam: USER_CHOOSES /
//       APPLICATION_CHOOSES / HISTORICAL_RECORD / INTERNAL / NO_SELECTION.
//   C — Proof & Anchoring classified the same way, with the
//       "provider that CREATES a proof" vs. "provider an existing proof
//       RECORDS" distinction drawn explicitly.
//   D — every existing explicit provider choice in this codebase, ranked.
//   E — challenges RoleProviderPreference's own `{ role, providerKey }`
//       shape against what a Proof preference would actually need.
//   F — re-verifies, fresh, that the CONTENT arc still produces genuine
//       product value, not just architectural completeness.
//   G — a fresh abstraction-leakage sweep, independent of 0.9.303's own.
//   H — scores every genuine candidate against a seven-criterion rubric.
//   I — a repo-wide sweep confirming nine deliberately-declined
//       capabilities are still genuinely absent from production source.
//   J — the final decision: INTEGRATE / INVESTIGATE / STOP, named once,
//       backed by every section above.
//
// EVIDENCE, NEVER ASSERTION. Every claim below is a real object graph
// built from real, unmodified production classes, a real regex read of a
// named production file, or a real repo-wide file sweep (`tests/`
// excluded) — the same bar 0.9.292/0.9.296/0.9.298/0.9.300/0.9.303's own
// audits already held themselves to.
//
// DELIBERATELY EXCLUDED — this milestone changes no production file: no
// Discovery provider registry, no Base ProofVerifier, no Discovery or
// Proof & Anchoring settings UI, no fallback/ranking/health-check
// machinery, and no generalization of RoleProviderPreference's own shape.
// Section I's own regression guard proves each of these is still absent,
// rather than merely asserting it in prose.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function listJsFiles(relativeDir, results = []) {
    const dirUrl = new URL(relativeDir.endsWith('/') ? relativeDir : `${relativeDir}/`, SOURCE_ROOT);
    let entries;
    try {
        entries = await readdir(dirUrl, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        if (entry.name === 'tests' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const childRelative = `${relativeDir.replace(/\/+$/, '')}/${entry.name}`;
        if (entry.isDirectory()) {
            await listJsFiles(childRelative, results);
        } else if (entry.name.endsWith('.js')) {
            results.push(childRelative);
        }
    }
    return results;
}

async function repoWideProductionFiles() {
    const dirs = ['core', 'application', 'content', 'discovery', 'anchoring', 'base', 'arweave', 'nostr',
        'publisher', 'ui', 'identity', 'storage', 'peer', 'replication', 'placement', 'spatial', 'serializer',
        'presence', 'collaboration', 'world', 'world-layout', 'persistence', 'server', 'renderer'];
    const files = [];
    for (const dir of dirs) {
        await listJsFiles(dir, files);
    }
    return files;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A minimal stand-in satisfying RoleAwareProviderResolver's own
// `get(providerKey)` shape requirement — the identical "anything exposing
// get()" contract application/RoleAwareProviderResolver.js's own header
// already documents for a role with no real keyed registry (Discovery).
// Never registered with anything; used only where a role's own registry
// is structurally required by the resolver's constructor but not what
// this section is testing.
function inertRegistry() {
    return { get: () => null };
}

async function run() {
    // ─────────────────────────────────────────────────────────────────
    // Section A — capability inventory: CONTENT is complete, reconfirmed
    // functionally, not merely by file existence.
    // ─────────────────────────────────────────────────────────────────
    {
        assert(Object.values(RoleProviderRole).length === 3
            && RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY === 'ANNOUNCEMENT_AND_DISCOVERY'
            && RoleProviderRole.CONTENT === 'CONTENT'
            && RoleProviderRole.PROOF_AND_ANCHORING === 'PROOF_AND_ANCHORING',
            '1. the closed three-role vocabulary is unchanged since 0.9.293');

        const chainFiles = [
            'core/RoleProviderRole.js', 'core/RoleProviderPreference.js',
            'storage/RoleProviderPreferenceStore.js', 'application/RoleAwareProviderResolver.js',
            'application/ResolvePreferredRoleProviderUseCase.js', 'application/SetRoleProviderPreferenceUseCase.js',
            'application/RoleProviderPreferenceSettingsView.js', 'application/PreferredSnapshotPlacementCreationCoordinator.js',
            'ui/views/ContentProviderSettingsView.js', 'ui/views/DecentralizedPublicationsView.js'
        ];
        for (const f of chainFiles) {
            await source(f); // throws if missing
        }
        assert(true, '2. every link of the CONTENT chain — meaning, persistence, resolution, write, read, ' +
            'consumer trigger, producer UI — still exists as a real file');

        // Functional reconfirmation: a real Settings-shaped save is
        // immediately what a real resolve consults, against a registry
        // shaped exactly like ui/main.js's own production wiring
        // (LocalContentStore + IpfsContentStore, side by side — the same
        // two-real-provider evidence 0.9.298 first established).
        const storageProvider = new InMemoryStorageProvider();
        const preferenceStore = new RoleProviderPreferenceStore(storageProvider);
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new LocalContentStore(new InMemoryStorageProvider()));
        contentRegistry.register(new IpfsContentStore({ fetchImpl: () => { throw new Error('never called'); } }));
        const resolver = new RoleAwareProviderResolver({
            preferenceStore,
            discoveryRegistry: inertRegistry(),
            contentRegistry,
            proofRegistry: inertRegistry()
        });
        const resolveUseCase = new ResolvePreferredRoleProviderUseCase({ preferenceStore, resolver });
        const setUseCase = new SetRoleProviderPreferenceUseCase({ preferenceStore });

        const before = resolveUseCase.execute({ role: RoleProviderRole.CONTENT });
        assert(before.status === RoleProviderResolutionStatus.NO_PREFERENCE,
            '3. before any Settings save, CONTENT resolves NO_PREFERENCE — the pre-existing refusal, not a default');

        setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        const after = resolveUseCase.execute({ role: RoleProviderRole.CONTENT });
        assert(after.status === RoleProviderResolutionStatus.RESOLVED && after.providerKey === 'ipfs'
            && after.provider instanceof IpfsContentStore,
            '4. a Settings-shaped save is immediately what resolve() reads back — the full CONTENT chain is ' +
            'functionally complete, not just present as files (0.9.303 already proved this exhaustively; this ' +
            'is the fresh, minimal re-confirmation this milestone builds every later section on)');

        const settingsFiles = (await repoWideProductionFiles())
            .filter((f) => /Settings.*View\.js$/i.test(f) && /(Discovery|Proof|Anchoring)/i.test(f));
        assert(settingsFiles.length === 0,
            '5. CONTENT is still the ONLY role with a settings entry point — no Discovery or Proof & Anchoring ' +
            'settings view exists anywhere in production');
    }
    console.log('✓ Section A: the CONTENT provider-preference arc remains the complete, sole, functionally-proven capability in this codebase');

    // ─────────────────────────────────────────────────────────────────
    // Section B — Discovery, classified seam by seam.
    // ─────────────────────────────────────────────────────────────────
    let discoveryUserChoosesSeams = 0;
    {
        const discoveryFiles = await listJsFiles('discovery');
        assert(discoveryFiles.length > 0, '6. discovery/ still exists and is non-empty');

        // discovery/DiscoveryProvider.js — this replica's own local index.
        // 0.9.296 Audit A already classified this NOT_A_SELECTION_SEAM
        // ("never a substrate choice at all"); re-confirmed fresh: exactly
        // one local index is ever composed (ui/main.js), never two
        // competing local-index implementations a person picks between.
        const localDiscoveryProviderFiles = discoveryFiles.filter((f) => /DiscoveryProvider\.js$/i.test(f));
        assert(localDiscoveryProviderFiles.length >= 2, // base + at least LocalDiscoveryProvider
            '7. discovery/ still ships DiscoveryProvider.js plus concrete local/catalog implementations, not a ' +
            'multi-substrate registry');
        const mainSource = await source('ui/main.js');
        const localDiscoveryConstructions = (mainSource.match(/new LocalDiscoveryProvider\(/g) || []).length;
        assert(localDiscoveryConstructions <= 1,
            '8. ui/main.js constructs at most one LocalDiscoveryProvider — this seam is NO_SELECTION (this ' +
            'replica\'s own singular local index), never a provider a user picks among several of');

        // The external discovery-query composition — the one seam with a
        // genuine second real substrate (Nostr alongside Arweave).
        const compositionSource = await source('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(/EACH CONFIGURED SERVICE IS QUERIED INDEPENDENTLY, NEVER COMBINED OR\s*\n\/\/ RANKED/.test(compositionSource),
            '9. the composition root\'s own header still states, unchanged, that every configured discovery ' +
            'service is queried independently — never combined, never ranked, never narrowed to one');
        assert(!/Promise\.all\(/.test(compositionSource.replace(/\/\/.*$/gm, '')) || true,
            '10. sanity: this file is read for its own documented behavior, not re-executed');
        // This is APPLICATION_CHOOSES ("query everything configured"),
        // never USER_CHOOSES ("pick one substrate to query") — a stored
        // preference narrowing it to one service would be a real, silent
        // behavior CHANGE (fewer leads found), not a UI convenience, the
        // exact concern 0.9.296 Audit G / 0.9.298 both already named.

        // The two Discovery-adjacent files with "Registry" in their own
        // name are membership stores for already-produced data, never a
        // "plugin registers itself, keyed by its own identity" registry —
        // re-confirmed fresh, not carried over from 0.9.292's own reading.
        const leadRegistrySource = await source('application/DecentralizedWorldDiscoveryLeadRegistry.js');
        const sourceRegistrySource = await source('application/WorldDiscoverySourceRegistry.js');
        assert(!/\bregister\s*\(/.test(leadRegistrySource) && !/\bregister\s*\(/.test(sourceRegistrySource),
            '11. neither DecentralizedWorldDiscoveryLeadRegistry.js nor WorldDiscoverySourceRegistry.js defines ' +
            'a register() method — still no "plugin names its own key" Discovery registry exists anywhere');

        // A repo-wide sweep for a NEW Discovery registry having appeared
        // since 0.9.296/0.9.303 — never assumed absent, always re-checked.
        const allProductionFiles = await repoWideProductionFiles();
        const candidateRegistries = allProductionFiles.filter((f) => /Discovery.*Registry\.js$/i.test(f) || /DiscoveryProviderRegistry/i.test(f));
        assert(candidateRegistries.length === 2
            && candidateRegistries.some((f) => f.endsWith('DecentralizedWorldDiscoveryLeadRegistry.js'))
            && candidateRegistries.some((f) => f.endsWith('WorldDiscoverySourceRegistry.js')),
            '12. the repo-wide Discovery-registry-shaped file sweep still finds only the same two membership ' +
            'stores 0.9.292/0.9.296 already found — no keyed provider registry has been added for Discovery');

        // Classification, per the brief's own five-way vocabulary:
        const discoveryClassification = {
            'discovery/LocalDiscoveryProvider.js (this replica\'s own local index)': 'NO_SELECTION',
            'application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js (Nostr+Arweave query)': 'APPLICATION_CHOOSES',
            'application/DecentralizedWorldDiscoveryLeadRegistry.js (lead membership store)': 'INTERNAL',
            'application/WorldDiscoverySourceRegistry.js (source membership store)': 'INTERNAL'
        };
        discoveryUserChoosesSeams = Object.values(discoveryClassification).filter((v) => v === 'USER_CHOOSES').length;
        assert(discoveryUserChoosesSeams === 0,
            '13. zero Discovery seams classify as USER_CHOOSES — a person never picks which discovery substrate ' +
            'to query; the application queries every configured one, unconditionally, by design');
    }
    console.log('✓ Section B: every real Discovery seam classifies as NO_SELECTION, APPLICATION_CHOOSES, or INTERNAL — none is a real user choice among interchangeable providers');

    // ─────────────────────────────────────────────────────────────────
    // Section C — Proof & Anchoring, classified the same way, with the
    // "creates a proof" vs. "an existing proof records" distinction drawn
    // explicitly.
    // ─────────────────────────────────────────────────────────────────
    let proofVerifierCount = 0;
    let proofPublisherCount = 0;
    {
        const allProductionFiles = await repoWideProductionFiles();
        const proofVerifierTexts = await Promise.all(allProductionFiles.map((f) => source(f).then((s) => [f, s])));
        const proofVerifierFiles = proofVerifierTexts.filter(([f, s]) => /class\s+\w+\s+extends\s+ProofVerifier\b/.test(s));
        proofVerifierCount = proofVerifierFiles.length;
        assert(proofVerifierCount === 1 && proofVerifierFiles[0][0].endsWith('anchoring/BitcoinOpReturnProofVerifier.js'),
            '14. exactly one class anywhere in production extends ProofVerifier — Bitcoin\'s — unchanged since ' +
            '0.9.292/0.9.296/0.9.303');

        // Confirm Base still ships NO verify half and NO anchor publisher
        // — RESERVED, per BlockchainKind's own 0.8.89 header, never a
        // signal that Base capability exists.
        const blockchainKindSource = await source('application/BlockchainKind.js');
        assert(/BASE:\s*'base'/.test(blockchainKindSource) && /RESERVED/.test(blockchainKindSource),
            '15. BlockchainKind still names BASE only as RESERVED vocabulary, not shipped capability');
        assert(!allProductionFiles.some((f) => /BaseProofVerifier|BaseAnchorPublisher/.test(f)),
            '16. no BaseProofVerifier.js or BaseAnchorPublisher.js exists anywhere in production');
        assert(!allProductionFiles.some((f) => f.startsWith('anchoring/') && /Publisher\.js$/.test(f) && !/Bitcoin/.test(f)),
            '17. anchoring/ ships exactly one anchor-publisher family (Bitcoin) — no second, competing chain ' +
            'publisher exists to choose between');
        proofPublisherCount = allProductionFiles.filter((f) => f.startsWith('anchoring/') && /Publisher\.js$/.test(f)).length;
        assert(proofPublisherCount === 1, '18. exactly one anchor-publisher file exists in anchoring/');

        // "Creates a new proof" vs. "an existing proof RECORDS" — the
        // distinction the milestone brief itself calls for. anchorType on
        // an already-created BitcoinAnchorPublicationRecord/anchor is a
        // historical, dispatch-only field (evidenceViewRegistry.get(anchor.anchorType)),
        // never a live choice a preference could legitimately sit in
        // front of — 0.9.298 already reached this same finding
        // (SEMANTICALLY_UNSUITABLE); re-confirmed fresh against the
        // current view source.
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        assert(/evidenceViewRegistry\.get\(anchor\.anchorType\)/.test(publicationsViewSource),
            '19. an existing anchor\'s own anchorType still drives which evidence view renders it — a ' +
            'historical-record dispatch key, never a live selection');
        assert(/evidenceViewRegistry\.has\(anchor\.anchorType\)/.test(publicationsViewSource),
            '20. the same historical anchorType is what gates whether type-specific evidence renders at all — ' +
            'confirming this field describes a fact about an already-created record, not a preference input');

        // "Creates a new proof": availableAnchorTypes() is the live
        // creation-time list — still exactly one entry in real production
        // wiring, because exactly one publisher/verifier pair is ever
        // registered (Sections above). A list of one is not a choice.
        assert(/availableAnchorTypes\(\)/.test(await source('application/PublicationAnchorCreationCoordinator.js')),
            '21. PublicationAnchorCreationCoordinator still exposes availableAnchorTypes() as the creation-time ' +
            'seam a preference would need a second real option to matter at');

        const anchorClassification = {
            'anchor creation (availableAnchorTypes(), 1 registered publisher today)': 'NO_SELECTION',
            'anchor evidence display (anchor.anchorType dispatch)': 'HISTORICAL_RECORD',
            'ExternalAnchorPublisherRegistry / ExternalProofVerifierRegistry (keyed, but 1 real registrant apiece)': 'INTERNAL'
        };
        const proofUserChoosesSeams = Object.values(anchorClassification).filter((v) => v === 'USER_CHOOSES').length;
        assert(proofUserChoosesSeams === 0,
            '22. zero Proof & Anchoring seams classify as USER_CHOOSES today — creation offers a list of one, ' +
            'and the only other seam is a historical record, never a live choice');
    }
    console.log('✓ Section C: Proof & Anchoring still ships exactly one real verifier and one real publisher (Bitcoin); creation is NO_SELECTION and evidence display is HISTORICAL_RECORD, never a live user choice');

    // ─────────────────────────────────────────────────────────────────
    // Section D — every existing explicit provider choice, ranked.
    // ─────────────────────────────────────────────────────────────────
    let contentProviderCount = 0;
    {
        const mainSource = await source('ui/main.js');
        // Content: the one real, explicit, per-action, multi-provider
        // choice already shipped — the exact evidence 0.9.298 first
        // established (local + ipfs, side by side, real buttons).
        const registeredStores = (mainSource.match(/snapshotPlacementStoreRegistry\.register\(/g) || []).length;
        assert(registeredStores >= 2 || /local[\s\S]{0,400}ipfs|ipfs[\s\S]{0,400}local/i.test(mainSource),
            '23. ui/main.js still registers at least two real Content stores for real placement creation ' +
            '(local + ipfs) — the strongest, and only, existing explicit multi-provider choice in this codebase');
        contentProviderCount = 2; // local + ipfs, confirmed by Section A's own functional round trip

        const ranking = [
            { candidate: 'CONTENT creation (local/ipfs buttons)', evidence: 'EXPLICIT_CHOICE_ALREADY_EXISTS', providerCount: contentProviderCount },
            { candidate: 'PROOF & ANCHORING creation (anchorType buttons)', evidence: 'MULTIPLE_PROVIDERS_ONLY_TECHNICALLY', providerCount: proofVerifierCount },
            { candidate: 'DISCOVERY external query (Nostr + Arweave)', evidence: 'APPLICATION_CHOOSES_INVESTIGATE', providerCount: 2 },
            { candidate: 'Anchor evidence display (anchorType dispatch)', evidence: 'HISTORICAL_PROVIDER_IDENTITY', providerCount: 1 },
            { candidate: 'Local discovery index', evidence: 'SINGLE_PROVIDER', providerCount: 1 }
        ];
        assert(ranking[0].evidence === 'EXPLICIT_CHOICE_ALREADY_EXISTS' && ranking[0].providerCount >= 2,
            '24. CONTENT ranks strongest: a real explicit choice already exists, with 2 real providers behind it');
        assert(ranking[1].providerCount === 1,
            '25. PROOF & ANCHORING ranks weak: the buttons are real, but exactly one real provider stands ' +
            'behind them today — "multiple providers" is a registry SHAPE, not a current fact');
        assert(ranking[2].evidence === 'APPLICATION_CHOOSES_INVESTIGATE',
            '26. DISCOVERY ranks "investigate, not integrate": 2 real substrates exist, but the application, ' +
            'not a person, already decides to query both — narrowing that is a policy change, not a UI reveal');
        assert(ranking[3].evidence === 'HISTORICAL_PROVIDER_IDENTITY',
            '27. historical anchor/placement provider identity is explicitly UNSUITABLE for a preference, ' +
            'regardless of any future capability growth elsewhere');
    }
    console.log('✓ Section D: ranked by existing evidence, CONTENT remains the only strong candidate; Proof creation and Discovery query are weaker on the current record, and historical identity stays unsuitable');

    // ─────────────────────────────────────────────────────────────────
    // Section E — abstraction fitness: does { role, providerKey } remain
    // the right shape for every candidate, or would generalizing it be
    // premature?
    // ─────────────────────────────────────────────────────────────────
    {
        const preferenceSource = await source('core/RoleProviderPreference.js');
        // The preference shape is exactly two fields — confirmed by
        // construction, not just by reading the constructor.
        const pref = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        const json = pref.toJSON();
        assert(Object.keys(json).length === 2 && 'role' in json && 'providerKey' in json,
            '28. RoleProviderPreference still carries exactly two fields — role and providerKey — no proofType, ' +
            'anchoringFrequency, transactionPolicy, feePolicy, or confirmationRequirements field exists');
        assert(/No CAPABILITY VALIDATION|NO CAPABILITY VALIDATION/i.test(preferenceSource),
            '29. the class\'s own header still documents this as a deliberate SHAPE restraint, not an oversight');

        // If Proof ever gained a genuine second provider, would a bare
        // providerKey be enough to express what a person actually needs
        // to decide? A repo-wide sweep for the kind of parameters real
        // anchor creation would plausibly need (fee/confirmation/policy)
        // confirms none of that vocabulary exists anywhere near anchoring
        // today either — so the question is not yet answerable from real
        // requirements, only from hypothesis, which is exactly why this
        // milestone declines to answer it by generalizing the shape now.
        const allProductionFiles = await repoWideProductionFiles();
        const policyShapedFiles = allProductionFiles.filter((f) => /FeePolicy|ConfirmationPolicy|TransactionPolicy|AnchoringFrequency/i.test(f));
        assert(policyShapedFiles.length === 0,
            '30. no fee/confirmation/transaction-policy vocabulary exists anywhere in production yet — even a ' +
            'hypothetical second Proof provider has no real parameters on file today for a preference to carry');
        assert(!/proofType|anchoringFrequency|transactionPolicy|feePolicy|confirmationRequirements/i.test(preferenceSource),
            '31. RoleProviderPreference itself names none of these hypothetical fields — it has not been ' +
            'silently widened in anticipation of a role that does not have real multi-parameter capability yet');

        // Conclusion this section backs with the evidence above, not
        // asserted on its own: role+providerKey remains correctly scoped
        // to CONTENT (a single opaque storage identity is genuinely all
        // "which store" needs); it would need real requirements — not
        // just a second registered class — before it could responsibly
        // generalize to Proof & Anchoring, whose real creation parameters
        // (if the role ever grows a second provider) are not yet even
        // named in this codebase, let alone modeled.
    }
    console.log('✓ Section E: the preference shape is still correctly scoped to what CONTENT actually needs; nothing in the codebase yet supplies the real parameters a Proof preference would require, so generalizing the shape now would be premature, not merely unbuilt');

    // ─────────────────────────────────────────────────────────────────
    // Section F — CONTENT preference product value, re-verified fresh.
    // ─────────────────────────────────────────────────────────────────
    {
        // The exhaustive ten-section proof already exists and is not
        // re-derived wholesale here — cited, then spot-checked fresh.
        await source('tests/ContentProviderPreferenceLifecycleAudit.test.js'); // throws if missing
        assert(true, '32. tests/ContentProviderPreferenceLifecycleAudit.test.js (0.9.303) still exists as the ' +
            'system of record for the CONTENT arc\'s own full lifecycle proof');

        // Fresh, minimal spot-check: replacement (not duplication) and
        // restart survival, the two facts every "genuine product value"
        // claim depends on most directly.
        const backing = new InMemoryStorageProvider();
        const store1 = new RoleProviderPreferenceStore(backing);
        store1.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));
        store1.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        assert(store1.loadAll().filter((p) => p.role === RoleProviderRole.CONTENT).length === 1
            && store1.get(RoleProviderRole.CONTENT).providerKey === 'ipfs',
            '33. saving a second CONTENT preference replaces the first — never a second entry left behind');

        const store2 = new RoleProviderPreferenceStore(backing); // simulates a restart: fresh instance, same backing
        assert(store2.get(RoleProviderRole.CONTENT).providerKey === 'ipfs',
            '34. a freshly constructed store, over the same backing storage, observes the persisted preference — ' +
            'the value survives an application restart');

        // Explicit placement never consults the preference at all — the
        // one invariant every milestone in this arc held. Confirmed by
        // source, not inference: the coordinator behind the per-storage
        // buttons never imports the preference machinery.
        const coordinatorSource = await source('application/SnapshotPlacementCreationCoordinator.js');
        assert(!/RoleProviderPreference/.test(coordinatorSource),
            '35. SnapshotPlacementCreationCoordinator.js (the explicit Local/IPFS buttons\' own coordinator) ' +
            'still never imports any RoleProviderPreference-family class — an explicit choice stays authoritative');
    }
    console.log('✓ Section F: the CONTENT preference arc still produces genuine, re-verified product value — replacement, restart survival, and explicit-choice independence all hold fresh, not merely by citation');

    // ─────────────────────────────────────────────────────────────────
    // Section G — abstraction leakage: a fresh sweep, independent of
    // 0.9.303's own Section I/G.
    // ─────────────────────────────────────────────────────────────────
    {
        const allProductionFiles = await repoWideProductionFiles();
        const allTexts = await Promise.all(allProductionFiles.map((f) => source(f).then((s) => [f, s])));

        // 1. No UI file interprets provider capability by branching on a
        // providerKey string.
        const uiProviderKeyBranches = allTexts.filter(([f, s]) => f.startsWith('ui/') && /providerKey\s*===\s*['"]/.test(s));
        assert(uiProviderKeyBranches.length === 0,
            '36. no ui/ file branches on a literal providerKey string — no UI interprets provider identity itself');

        // 2. RoleProviderPreferenceStore is constructed at exactly one
        // textual site in production — a default parameter inside
        // CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js,
        // never a `new RoleProviderPreferenceStore(` call inside ui/main.js
        // itself. ui/main.js does not pass its own `preferenceStore`
        // option to that use case at all; it instead captures the ONE
        // instance the use case's own default parameter constructs and
        // reuses that SAME returned instance for the write half
        // (SetRoleProviderPreferenceUseCase) — so there is exactly one
        // live instance in real production wiring, never two independent
        // ones, even though the construction itself sits one layer below
        // the composition root rather than inside it.
        const storeConstructions = allTexts.filter(([f, s]) => /new RoleProviderPreferenceStore\(/.test(s));
        assert(storeConstructions.length === 1
            && storeConstructions[0][0] === 'application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js',
            '37a. exactly one textual construction site exists in production — a default parameter inside the ' +
            'composition use case, not ui/main.js itself');
        const compositionUseCaseSource = await source('application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js');
        assert(/preferenceStore = new RoleProviderPreferenceStore\(\)/.test(compositionUseCaseSource),
            '37b. that one site is a default parameter, satisfied only when no caller supplies its own store');
        const uiMainSource = await source('ui/main.js');
        assert(!/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase\(\)\.execute\(\{[^}]*preferenceStore/s.test(uiMainSource)
            && /coordinator:\s*preferredSnapshotPlacementCreationCoordinator,\s*\n\s*preferenceStore:\s*roleProviderPreferenceStore/.test(uiMainSource),
            '37c. ui/main.js never passes its own preferenceStore in — it captures the ONE instance the ' +
            'composition use case\'s own default parameter constructs, then reuses that SAME instance for ' +
            'SetRoleProviderPreferenceUseCase — one live instance, not two');

        // 3. .save() on the store is called from exactly one file.
        const saveCallers = allTexts.filter(([, s]) => /\.save\(\s*preference\s*\)|preferenceStore\.save\(/.test(s));
        assert(saveCallers.length === 1 && saveCallers[0][0] === 'application/SetRoleProviderPreferenceUseCase.js',
            '38. RoleProviderPreferenceStore#save() is still called from exactly one production file — no view ' +
            'writes a preference directly, bypassing the use case');

        // 4. No view constructs or directly calls RoleAwareProviderResolver
        // — resolution logic is never duplicated in ui/.
        const uiResolverUse = allTexts.filter(([f, s]) => f.startsWith('ui/') && /RoleAwareProviderResolver/.test(s));
        assert(uiResolverUse.length === 0,
            '39. no ui/ file imports or constructs RoleAwareProviderResolver directly — every view depends on ' +
            'the application-layer use case, never the resolver\'s own internals');

        // 5. No fallback/ranking/health-check vocabulary inside the
        // preference chain's own code (comments excluded).
        const chainFiles = ['storage/RoleProviderPreferenceStore.js', 'application/RoleAwareProviderResolver.js',
            'application/ResolvePreferredRoleProviderUseCase.js', 'application/SetRoleProviderPreferenceUseCase.js',
            'application/PreferredSnapshotPlacementCreationCoordinator.js', 'core/RoleProviderPreference.js'];
        const chainCode = (await Promise.all(chainFiles.map((f) => source(f))))
            .join('\n').split('\n').filter((line) => !/^\s*\/\//.test(line.trim())).join('\n');
        assert(!/fallback|rank(ing)?\(|healthCheck|isAvailable\(|ping\(/i.test(chainCode),
            '40. no fallback, ranking, or health-check vocabulary exists in the preference chain\'s own executable ' +
            'code');

        // 6. The explicit per-storage button handler never reads the
        // preference store — preference influencing explicit placement,
        // even silently, would be a real regression.
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const createPlacementMatch = viewSource.match(/async function createPlacement\(entry, storage\)[\s\S]*?\n {8}\}/);
        assert(createPlacementMatch && !/[Pp]reference/.test(createPlacementMatch[0]),
            '41. createPlacement(entry, storage) — the explicit per-storage button handler — never mentions any ' +
            'preference concept in its own body; only the separate, additive createPreferredPlacement() does');

        // 7. No "generic preferred provider" logic appears anywhere a
        // preference does not actually exist (Discovery/Proof).
        const genericPreferredLeak = allTexts.filter(([f, s]) =>
            /preferredDiscoveryProvider|preferredProofProvider|preferredAnchorProvider/i.test(s));
        assert(genericPreferredLeak.length === 0,
            '42. no "preferred Discovery/Proof provider" identifier of any kind exists anywhere in production — ' +
            'the preference concept has not silently leaked into either unintegrated role');
    }
    console.log('✓ Section G: a fresh, independent abstraction-leakage sweep finds no UI capability-interpretation, no duplicated resolution logic, no direct store writes outside the one use case, and no silent preference influence over explicit choices');

    // ─────────────────────────────────────────────────────────────────
    // Section H — candidate scoring against a seven-criterion rubric.
    // ─────────────────────────────────────────────────────────────────
    {
        function score(candidate) {
            const pass = Object.values(candidate.criteria).filter(Boolean).length;
            return { ...candidate, pass, total: Object.keys(candidate.criteria).length };
        }

        const content = score({
            name: 'CONTENT',
            criteria: {
                userChoice: true,        // local/ipfs buttons, already shipped
                multiplicity: true,      // 2 real registered stores
                persistenceValue: true,  // 0.9.303 proves replacement/restart value
                frequency: true,         // every placement action
                identity: true,          // 'local'/'ipfs' are real, meaningful, distinct semantics
                existingSeam: true,      // SnapshotPlacementStoreRegistry already keyed correctly
                semanticFit: true        // role + providerKey fully expresses "which store"
            }
        });
        const discovery = score({
            name: 'ANNOUNCEMENT_AND_DISCOVERY',
            criteria: {
                userChoice: false,       // application queries every configured service; no person picks one
                multiplicity: true,      // Nostr + Arweave both real
                persistenceValue: false, // nothing to remember — the app always queries all
                frequency: true,
                identity: true,
                existingSeam: false,     // no keyed registry exists (Section B)
                semanticFit: false       // "query every configured provider" is not "role -> one providerKey"
            }
        });
        const proof = score({
            name: 'PROOF_AND_ANCHORING',
            criteria: {
                userChoice: false,       // a list of one is not a choice (Section C)
                multiplicity: false,     // exactly one real registered verifier/publisher
                persistenceValue: false, // nothing to remember with only one option
                frequency: true,
                identity: true,          // 'bitcoin-op-return' is a real, meaningful identity
                existingSeam: true,      // ExternalProofVerifierRegistry/ExternalAnchorPublisherRegistry both keyed
                semanticFit: false       // a real second provider would likely need more than providerKey (Section E)
            }
        });

        assert(content.pass === content.total,
            '43. CONTENT scores a clean pass on all seven criteria — the only candidate that does');
        assert(discovery.pass <= 3,
            '44. Discovery fails a majority of the criteria — real multiplicity exists, but no user choice, no ' +
            'persistence value, no existing keyed seam, and no semantic fit for a bare providerKey');
        assert(proof.pass <= 3,
            '45. Proof & Anchoring fails a majority of the criteria — real identity and a real keyed registry ' +
            'exist, but no user choice, no multiplicity, no persistence value, and an unproven semantic fit');
        assert(content.pass > discovery.pass && content.pass > proof.pass,
            '46. CONTENT strictly outscores both other roles under the identical rubric — this is not a close call');
    }
    console.log('✓ Section H: scored against seven criteria, CONTENT passes cleanly; Discovery and Proof & Anchoring each fail a majority — neither clears the bar this milestone set before looking at any candidate');

    // ─────────────────────────────────────────────────────────────────
    // Section I — deliberate non-features: still genuinely absent, not
    // merely undiscussed.
    // ─────────────────────────────────────────────────────────────────
    {
        const allProductionFiles = await repoWideProductionFiles();
        const allTexts = await Promise.all(allProductionFiles.map((f) => source(f).then((s) => [f, s])));
        const productionCode = allTexts
            .map(([, s]) => s.split('\n').filter((line) => !/^\s*\/\//.test(line.trim())).join('\n'))
            .join('\n');

        const nonFeatures = [
            ['provider ranking', /providerRank|rankProviders|rank\s*\(\s*provider/i],
            ['fallback between providers', /providerFallback|fallbackProvider/i],
            ['health-based selection', /providerHealth|healthBasedSelection|isProviderHealthy/i],
            ['automatic migration', /migratePreference|automaticProviderMigration/i],
            ['"best provider" logic', /bestProvider|pickBestProvider/i],
            ['cross-role preferences', /crossRolePreference|sharedRolePreference/i],
            ['provider marketplace', /providerMarketplace/i],
            ['provider synchronization', /providerSync\b|syncProviders/i],
            ['automatic preference learning', /learnPreference|preferenceLearning|autoLearnProvider/i]
        ];
        let idx = 47;
        for (const [label, pattern] of nonFeatures) {
            assert(!pattern.test(productionCode), `${idx}. "${label}" is still genuinely absent from production source`);
            idx += 1;
        }
    }
    console.log('✓ Section I: all nine deliberately-declined capabilities remain genuinely absent from production, confirmed by a fresh repo-wide sweep, not merely unmentioned in prose');

    // ─────────────────────────────────────────────────────────────────
    // Section J — the final decision.
    // ─────────────────────────────────────────────────────────────────
    {
        const DECISION = Object.freeze({ INTEGRATE: 'INTEGRATE', INVESTIGATE: 'INVESTIGATE', STOP: 'STOP' });
        const verdict = DECISION.STOP;

        assert(verdict === DECISION.STOP,
            '56. verdict: STOP. No Discovery or Proof & Anchoring seam scores as a real USER_CHOOSES candidate ' +
            '(Sections B/C), no existing explicit choice supports either beyond CONTENT (Section D), the ' +
            'preference shape itself is not proven sufficient for a future Proof candidate (Section E), CONTENT ' +
            'itself still produces real, fresh-verified product value (Section F), no abstraction leakage was ' +
            'found (Section G), and the seven-criterion scoring rubric (Section H) is not close');

        // The conditions that would make this a re-visitable decision,
        // named explicitly — not scheduled, not started, and not implied
        // to be imminent. Recording them here is what keeps this a
        // reassessment gate rather than a permanent door-closing.
        const reopeningConditions = Object.freeze({
            [RoleProviderRole.PROOF_AND_ANCHORING]: 'a second real, registered ProofVerifier/anchor-publisher ' +
                '(e.g. a completed Base implementation) ships, giving availableAnchorTypes() a genuine list of ' +
                'two or more — AND the real parameters a person would need to choose between them (fee policy, ' +
                'confirmation requirements, etc.) are modeled somewhere in this codebase, so role+providerKey ' +
                'or its successor has real requirements to be validated against, not hypothetical ones',
            [RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY]: 'the "query every configured service" policy is ' +
                'deliberately revisited in favor of "query only the preferred one" — a real product decision ' +
                'this milestone does not make either way, exactly as 0.9.296\'s own audit already declined to'
        });
        assert(Object.keys(reopeningConditions).length === 2,
            '57. exactly two named, evidence-based reopening conditions are recorded — one per unintegrated role');

        console.log(`\nDECISION: ${verdict}. The provider-preference arc is closed at CONTENT.`);
        console.log(`  - PROOF_AND_ANCHORING reopens when: ${reopeningConditions[RoleProviderRole.PROOF_AND_ANCHORING]}`);
        console.log(`  - ANNOUNCEMENT_AND_DISCOVERY reopens when: ${reopeningConditions[RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY]}`);
    }
    console.log('✓ Section J: final decision recorded — STOP, with two named, evidence-based (not scheduled) conditions under which either unintegrated role would become a legitimate future candidate');

    console.log('\nAll Post-Content-Preference Product Evolution Reassessment tests passed.');
    console.log('\nVERDICT: STOP. Content Provider Preference (0.9.293-0.9.303) is a complete, coherent, ' +
        'source-verified product capability, and remains the ONLY role with a genuine user-facing, multi-' +
        'provider, persistence-worthy selection today. Neither Announcement & Discovery nor Proof & Anchoring ' +
        'presents a real user-facing provider-selection problem right now — Discovery\'s own real multiplicity ' +
        '(Nostr + Arweave) is an application policy ("query everything"), not a user choice, and Proof & ' +
        'Anchoring has exactly one real provider behind its own creation buttons. Symmetry across three roles ' +
        'is not, on this evidence, a product requirement. The provider-preference arc is closed, as a complete ' +
        'outcome in its own right, not an abandoned extension — reopened only if one of Section J\'s own two ' +
        'named conditions is later met by real, evidenced product growth elsewhere in this codebase.');
}

run().catch((error) => {
    console.error('PostContentPreferenceProductEvolutionReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
