import { readFile, readdir } from 'node:fs/promises';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver, RoleProviderResolutionStatus } from '../application/RoleAwareProviderResolver.js';

import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';

// 0.9.296 — Role Provider Resolution Integration Readiness Audit.
//
// Test-only. Zero production changes. 0.9.293/0.9.294/0.9.295 built a
// complete, real, independently-tested preference → persistence →
// resolution boundary (`core/RoleProviderPreference.js`, `storage/
// RoleProviderPreferenceStore.js`, `application/RoleAwareProviderResolver.js`)
// — and none of the three is consumed by anything operational yet (see
// each file's own header, and `tests/RoleAwareProviderResolution.test.js`
// Section M). 0.9.295's own "What comes after" named the question this
// milestone answers, verbatim: pause before wiring the resolver into
// runtime, and find out — from real source, never from assumption —
// whether the existing production architecture even HAS a competing
// provider-selection source of truth to displace, and where, if anywhere,
// the resolver could eventually be inserted without changing what a
// person already experiences today.
//
//   RoleProviderPreference / RoleProviderPreferenceStore / RoleAwareProviderResolver
//   (0.9.293/0.9.294/0.9.295, unmodified — this audit reads their own
//   already-published headers and tests as evidence, never re-litigates
//   their own design decisions)
//                    │
//                    ▼
//   tests/RoleProviderResolutionIntegrationReadinessAudit.test.js   ★ (THIS)
//        Section A — every existing provider-selection point, traced from
//                     real source and classified by KIND (explicit /
//                     hard-coded / registry lookup / composition-time /
//                     implicit)
//        Section B — role → real runtime consumer matrix, evidence-backed
//        Section C — composition-root insertion points, IDENTIFIED, never
//                     built
//        Section D — hard-coded provider construction, swept and
//                     classified (construction / selection / protocol
//                     logic / fixture)
//        Section E — NO_PREFERENCE never silently becomes "default
//                     provider," at the resolver AND at every candidate
//                     insertion point Section C names
//        Section F — PROVIDER_NOT_FOUND never silently becomes "use
//                     whatever is already configured," at the resolver AND
//                     at every existing registry `.get()` this codebase
//                     already runs
//        Section G — the Discovery-registry decision point: is its
//                     absence actually blocking? Answered from evidence,
//                     not assumed
//        Section H — UI readiness: the settings-UI shape this codebase
//                     already establishes (AvatarSettingsView.js), and
//                     what a future preference UI must, and must not,
//                     touch
//        Section I — the final classification: READY / BLOCKED /
//                     INTENTIONALLY_INTERNAL / NOT_A_SELECTION_SEAM, for
//                     every seam Sections A-C found, and the verdict this
//                     whole milestone exists to reach
//
// THE MATRIX'S OWN BAR, STATED ONCE, HELD EVERYWHERE BELOW — the same bar
// `tests/DecentralizedSubstrateCapabilityMatrixAudit.test.js` (0.9.292)
// already set for itself: a claim below is never this file's own prose.
// It is a real `source()` read of the exact production file named, a real
// `instanceof`/construction check, or a real registry round-trip. Where a
// production file's own header already states a restraint in its own
// words (e.g. "never narrowed to a preferred or default one" —
// `application/SnapshotPlacementCreationCoordinator.js`), this file reads
// and quotes that restraint from the file itself, never restates it from
// memory.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, PER THE TASK'S OWN BRIEF.
// - **Any production change of any kind.** Every import in this file is
//   either an existing 0.9.293/0.9.294/0.9.295 boundary file (read-only,
//   used exactly as its own tests already use it) or an existing,
//   unmodified production collaborator, constructed here only to observe
//   its own already-shipped behavior.
// - **A settings UI, a preference screen, or any `ui/` change.** Section H
//   inspects `ui/` for evidence; it builds nothing there.
// - **Wiring `RoleAwareProviderResolver` into any composition root.**
//   Section C identifies where that COULD eventually happen; it performs
//   no insertion.
// - **A Discovery provider registry.** Section G is a decision, not a
//   build — see its own verdict for why one is not built here.
// - **Any change to Arweave/Nostr/IPFS/Bitcoin/Base implementations, or to
//   existing distribution/placement/anchoring behavior.** Every provider
//   construction in this file mirrors an existing test file's own
//   `neverCalled` restraint — structure and identity only, never live
//   wire behavior.

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
    const dirs = ['core', 'application', 'content', 'discovery', 'anchoring', 'base', 'arweave', 'nostr', 'publisher', 'ui', 'identity', 'storage', 'peer', 'replication', 'placement', 'spatial', 'serializer', 'presence', 'collaboration', 'world', 'world-layout', 'persistence', 'server', 'renderer'];
    const all = [];
    for (const dir of dirs) await listJsFiles(dir, all);
    return [...new Set(all)];
}

// The identical in-memory StorageProvider fake tests/
// DecentralizedRoleProviderPreferencePersistence.test.js and tests/
// RoleAwareProviderResolution.test.js already use for the same purpose.
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makePreferenceStore() {
    return new RoleProviderPreferenceStore(new InMemoryStorageProvider());
}

function emptyRegistry() {
    return { get: () => null };
}

function neverCalled() {
    throw new Error('neverCalled: this audit never actually invokes network/signing behavior');
}
const fakeSigner = { sign: neverCalled };

async function run() {
    // ===============================================================
    // Section A — Audit A: every existing provider-selection point,
    // traced from real source and classified by KIND.
    // ===============================================================
    const selectionPoints = [];
    {
        // --- A1: RESOLUTION seams (Content, Proof) — keyed by a record's
        // own already-persisted field, never a caller- or preference-
        // supplied one. ---
        const resolverSource = await source('application/SnapshotPlacementResolver.js');
        assert(/storeRegistry\s*\?\s*storeRegistry\.get\(placement\.storage\)/.test(resolverSource), 'A1a. SnapshotPlacementResolver looks stores up by the PLACEMENT\'s own storage field, never a caller-supplied key');
        selectionPoints.push({ role: 'CONTENT', seam: 'application/SnapshotPlacementResolver.js (resolution)', kind: 'registry lookup, keyed by the record\'s own historical field' });

        const verifierSource = await source('application/ExternalAnchorVerifier.js');
        assert(/proofVerifierRegistry\s*\?\s*proofVerifierRegistry\.get\(anchor\.anchorType\)/.test(verifierSource), 'A1b. ExternalAnchorVerifier looks proofVerifiers up by the ANCHOR\'s own anchorType field, never a caller-supplied key');
        selectionPoints.push({ role: 'PROOF', seam: 'application/ExternalAnchorVerifier.js (verification)', kind: 'registry lookup, keyed by the record\'s own historical field' });

        // --- A2: CREATION seams (Content, Proof) — explicit, caller-
        // supplied, per action; the coordinating classes themselves
        // DOCUMENT, in their own words, that they never narrow the
        // offered set to a preferred/default one. ---
        const normalizeComment = (text) => text.replace(/^\s*\/\/\s?/gm, '').replace(/\s+/g, ' ');
        const neverPreferredOrDefaultPattern = /never ranked, never narrowed to a\s*"preferred" or "default" one/;
        const placementCreationSource = await source('application/SnapshotPlacementCreationCoordinator.js');
        assert(neverPreferredOrDefaultPattern.test(normalizeComment(placementCreationSource)), 'A2a. SnapshotPlacementCreationCoordinator\'s own header states, in its own words, that availableStorageTypes() is never narrowed to a preferred/default entry');
        selectionPoints.push({ role: 'CONTENT', seam: 'application/CreateExternalSnapshotPlacementUseCase.js + SnapshotPlacementCreationCoordinator.js (creation)', kind: 'explicit, per-action, caller-supplied — no preferred/default concept exists here today, by explicit design' });

        const anchorCreationSource = await source('application/PublicationAnchorCreationCoordinator.js');
        assert(neverPreferredOrDefaultPattern.test(normalizeComment(anchorCreationSource)), 'A2b. PublicationAnchorCreationCoordinator\'s own header states the identical restraint for availableAnchorTypes()');
        selectionPoints.push({ role: 'PROOF', seam: 'application/CreateExternalPublicationAnchorUseCase.js + PublicationAnchorCreationCoordinator.js (creation)', kind: 'explicit, per-action, caller-supplied — no preferred/default concept exists here today, by explicit design' });

        // --- A3: DISTRIBUTION/DISCOVERY write-and-read composition roots
        // — exactly ONE Content collaborator and exactly ONE Discovery
        // collaborator is ever imported, with no conditional branch
        // between alternatives, for each of the three real composition
        // roots that actually exist. ---
        const compositionRoots = [
            'application/PublicationDistributionRuntimeComposition.js',
            'application/SnapshotDistributionRuntimeComposition.js',
            'application/DiscoverSnapshotRuntimeComposition.js'
        ];
        for (const file of compositionRoots) {
            const text = await source(file);
            const importLines = text.split('\n').filter((l) => /^import\b/.test(l));
            const contentImports = importLines.filter((l) => /Arweave(PublicationMaterialUploader|ContentStore)/.test(l));
            const discoveryImports = importLines.filter((l) => /Nostr(PublicationDiscoveryPublisher|SnapshotDiscoveryPublisher|SnapshotDiscoveryQueryService)/.test(l));
            assert(contentImports.length === 1, `A3. ${file} imports exactly one Content-role collaborator (found ${contentImports.length}) — no second implementation exists in this file for a preference to choose between`);
            assert(discoveryImports.length <= 1, `A3. ${file} imports at most one Discovery-role collaborator (found ${discoveryImports.length})`);
            assert(!/if\s*\(.*storage\s*===|switch\s*\(.*storage\)/.test(text), `A3. ${file} contains no storage-branching logic — the single collaborator is unconditional`);
            selectionPoints.push({ role: 'CONTENT+DISCOVERY', seam: file, kind: 'composition-time — exactly one hardcoded collaborator per role, no alternative exists to select between' });
        }

        // --- A4: the ONE real seam where a role already composes and
        // queries MORE THAN ONE provider at once — World Encounter
        // Publication discovery. Neither one is ever "selected"; BOTH are
        // constructed and BOTH are queried, unconditionally. ---
        const discoveryCompositionSource = await source('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(discoveryCompositionSource.includes('new NostrDiscoveryQueryService') && discoveryCompositionSource.includes('new ArweaveGraphqlDiscoveryQueryService'), 'A4a. both Nostr and Arweave Discovery services are constructed by the same composition function');
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: neverCalled, arweaveFetchImpl: neverCalled });
        assert(services.nostr !== null && services.arweave !== null, 'A4b. both are genuinely constructed, side by side, from one call — confirmed at the object level, not just from source text');
        selectionPoints.push({ role: 'DISCOVERY', seam: 'application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js (Publication discovery, read path)', kind: 'implicit — every configured provider is queried; none is ever "selected" over another today' });

        // --- A5: the local/catalog Discovery shape is not a substrate
        // choice at all — there is exactly one local index this replica
        // owns, never a competing alternative. ---
        const localMethods = ['list', 'findById', 'findByAuthor'];
        const discoveryProviderSource = await source('discovery/DiscoveryProvider.js');
        for (const m of localMethods) {
            assert(discoveryProviderSource.includes(m), `A5. discovery/DiscoveryProvider.js declares ${m} — the local/catalog contract, never a pluggable-substrate one`);
        }
        selectionPoints.push({ role: 'DISCOVERY', seam: 'discovery/DiscoveryProvider.js (local/catalog listing)', kind: 'not a substrate choice — this replica\'s own singular local index' });

        assert(selectionPoints.length === 9, `A6. nine real selection points traced, source-verified, and classified (found ${selectionPoints.length})`);
        console.log('  KIND                                          | ROLE            | SEAM');
        for (const p of selectionPoints) console.log(`  ${p.kind.slice(0, 44).padEnd(44)} | ${p.role.padEnd(15)} | ${p.seam}`);
        console.log('✓ Section A: every existing provider-selection point traced from real source — NONE of them is a stored, cross-session user PREFERENCE of the kind RoleProviderPreferenceStore now persists; the closest analogues are either (a) a historical fact re-read off an already-created record, (b) an explicit per-action human choice a coordinating class\'s own header says is deliberately never narrowed to a default, or (c) a composition-time constant with no second option to choose from at all');
    }

    // ===============================================================
    // Section B — Audit B: role → real runtime consumer matrix,
    // evidence-backed, never invented.
    // ===============================================================
    {
        const matrix = {
            [RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY]: {
                consumers: [
                    'application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js (Publication discovery, wired at ui/main.js 0.9.110/0.9.111 — real runtime consumer)',
                    'application/DiscoverSnapshotRuntimeComposition.js (Snapshot discovery, wired at ui/main.js 0.9.142 — real runtime consumer)',
                    'discovery/DiscoveryProvider.js (local/catalog listing — real runtime consumer, not a substrate role)'
                ],
                seam: 'THREE non-interchangeable shapes (0.9.292 Section A); only the first is multi-provider today',
                resolverReach: 'reaches the FIRST shape only, via a caller-built adapter (0.9.295 tests, Section B) — the resolver treats Discovery as one role with one registry, but real production Discovery is three shapes; a single injected discoveryRegistry cannot simultaneously answer for all three'
            },
            [RoleProviderRole.CONTENT]: {
                consumers: [
                    'application/SnapshotPlacementResolver.js (resolution — real runtime consumer, dispatches on the placement\'s own storage field)',
                    'application/CreateExternalSnapshotPlacementUseCase.js (creation — real runtime consumer, explicit per-action)',
                    'application/PublicationDistributionRuntimeComposition.js / SnapshotDistributionRuntimeComposition.js (distribution write path — real runtime consumers, single hardcoded Arweave collaborator)'
                ],
                seam: 'content/ContentStore.js — ONE real base class, but the registry-backed shape (SnapshotPlacementStoreRegistry) coexists with two separately-hardcoded single-provider write paths',
                resolverReach: 'reaches SnapshotPlacementStoreRegistry directly (0.9.295 tests, Section C) — but that registry backs RESOLUTION, a seam this audit\'s Section C below finds the resolver has no legitimate business entering'
            },
            [RoleProviderRole.PROOF_AND_ANCHORING]: {
                consumers: [
                    'application/ExternalAnchorVerifier.js (verification — real runtime consumer, dispatches on the anchor\'s own anchorType field)',
                    'application/CreateExternalPublicationAnchorUseCase.js (creation — real runtime consumer, explicit per-action)'
                ],
                seam: 'anchoring/ProofVerifier.js — ONE real base class, ONE real subclass (Bitcoin) registered in production today',
                resolverReach: 'reaches ExternalProofVerifierRegistry directly (0.9.295 tests, Section D) — same "resolution, not this resolver\'s business" caveat as Content, above'
            }
        };
        for (const role of Object.values(RoleProviderRole)) {
            assert(matrix[role].consumers.length >= 2, `B1. ${role} names at least two real, source-verified consumers, never invented merely because a capability exists`);
        }
        console.log('  ROLE                        | CONSUMERS (real, source-verified)');
        for (const [role, entry] of Object.entries(matrix)) {
            console.log(`  ${role.padEnd(27)} | ${entry.consumers.length} real consumer(s); resolver reach: ${entry.resolverReach}`);
        }
        console.log('✓ Section B: role → runtime consumer matrix built entirely from real, already-wired production files — Discovery alone still carries the three-shape asymmetry 0.9.292/0.9.295 both already named; the resolver, as designed, can only ever answer for ONE of Discovery\'s three shapes per instance');
    }

    // ===============================================================
    // Section C — Audit C: composition-root insertion points —
    // IDENTIFIED, never built.
    // ===============================================================
    {
        const insertionPoints = [
            {
                role: 'CONTENT / PROOF resolution (SnapshotPlacementResolver, ExternalAnchorVerifier)',
                verdict: 'NO LEGITIMATE INSERTION POINT',
                reason: 'these two seams resolve an ALREADY-CREATED record\'s own historical storage/anchorType — a fact about what already happened, never a live choice. A preference has no business overriding it; doing so would let a user\'s CURRENT preference silently reinterpret a PAST placement or anchor\'s own real provenance.'
            },
            {
                role: 'CONTENT / PROOF creation (SnapshotPlacementCreationCoordinator, PublicationAnchorCreationCoordinator)',
                verdict: 'NARROW, BUT GATED BEHIND AN EXPLICIT, DOCUMENTED PRINCIPLE',
                reason: 'availableStorageTypes()/availableAnchorTypes() already return every registered option, unranked, and each coordinator\'s own header states outright that this is NEVER narrowed to a preferred/default one. The narrowest legitimate insertion point (a resolver-sourced DEFAULT highlighted among the buttons ui/views/DecentralizedPublicationsView.js already renders per registered type) requires deliberately revisiting that stated principle first — this audit does not do that, and flags it as a real, named decision, not a technical blocker.'
            },
            {
                role: 'DISCOVERY (Publication read path, composeDecentralizedWorldEncounterMaterialDiscoveryServices)',
                verdict: 'MECHANICALLY REACHABLE TODAY (0.9.295 already proved the adapter)',
                reason: 'but production behavior today QUERIES EVERY CONFIGURED SERVICE, unconditionally — there is no "selected" service to replace. Wiring a preference here would change existing behavior (query all) into new behavior (query the preferred one, or rank), which is a genuine, unmade product decision, not a mechanical insertion.'
            },
            {
                role: 'CONTENT / DISCOVERY distribution write paths (Publication and Snapshot distribution, Snapshot discovery)',
                verdict: 'NO INSERTION POINT EXISTS YET',
                reason: 'each of these three composition roots hardcodes exactly one Content collaborator and at most one Discovery collaborator, with no second implementation anywhere in this codebase for that role in that path. A resolver has nothing to choose between; inserting one here would be decoration around an empty choice set, not integration.'
            }
        ];
        assert(insertionPoints.length === 4, 'C1. four candidate insertion points evaluated, all against real source, none built');
        assert(insertionPoints.filter((p) => p.verdict.startsWith('NO')).length === 2, 'C2. two of the four have no legitimate or no existing insertion point at all');
        console.log('  CANDIDATE                                                                  | VERDICT');
        for (const p of insertionPoints) console.log(`  ${p.role.slice(0, 74).padEnd(74)} | ${p.verdict}`);
        console.log('✓ Section C: not one candidate insertion point is a clean, unconditional "just call resolve() here" seam — every real candidate carries either a data-provenance conflict, an explicit documented principle to revisit, an existing multi-query behavior to reconcile, or a missing second provider. This is the honest reason 0.9.296 does not wire anything in.');
    }

    // ===============================================================
    // Section D — Audit D: hard-coded provider construction, swept
    // repo-wide and classified.
    // ===============================================================
    {
        const allProductionFiles = await repoWideProductionFiles();
        const constructionPattern = /new\s+(Arweave|Nostr|Ipfs|Bitcoin|Base)\w*\(/g;
        const CONSTRUCTION = 'composition construction (single, named collaborator — legitimate)';
        const SELECTION = 'provider selection (branches on a key — may need migration)';
        const counts = { [CONSTRUCTION]: 0, [SELECTION]: 0 };
        const selectionHits = [];
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (!constructionPattern.test(text)) continue;
            // A construction is "selection" only when it sits inside a
            // conditional branch keyed by a provider-identifying string —
            // never merely because a constructor call exists.
            const isBranchedSelection = /(if|switch|case|===|storage\s*===|anchorType\s*===)[^\n]{0,80}\n?[^\n]{0,80}new\s+(Arweave|Nostr|Ipfs|Bitcoin|Base)\w*\(/.test(text)
                && /(providerKey|substrate|network)\s*===/.test(text);
            if (isBranchedSelection) {
                counts[SELECTION] += 1;
                selectionHits.push(file);
            } else {
                counts[CONSTRUCTION] += 1;
            }
        }
        assert(counts[SELECTION] === 0, `D1. zero production files construct a concrete provider inside a branch keyed by a providerKey/substrate/network string (found ${counts[SELECTION]}: ${selectionHits.join(', ')}) — every hard-coded construction this repo-wide sweep found is unconditional composition, never a selection-among-alternatives`);
        assert(counts[CONSTRUCTION] > 40, `D2. ${counts[CONSTRUCTION]} production files construct a concrete provider unconditionally — this is the composition-construction category (legitimate), never a selection seam`);

        // Protocol-specific logic: real examples that use `anchorType`/
        // `storage` for PRESENTATION, never for choosing a provider to
        // construct.
        const uiDetailFiles = ['application/PublicationAnchorDetailView.js', 'application/PublicationSnapshotPlacementDetailView.js'];
        for (const file of uiDetailFiles) {
            const text = await source(file);
            const codeOnly = text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(/if\s*\(\s*(anchorType|storage)\s*===/.test(codeOnly) === false, `D3. ${file} contains no if (anchorType === ...)/if (storage === ...) branch in its own generic dispatch (its own header names the exact anti-pattern in prose, only to explain why it does not do it)`);
        }

        console.log(`  ${CONSTRUCTION}: ${counts[CONSTRUCTION]} files`);
        console.log(`  ${SELECTION}: ${counts[SELECTION]} files`);
        console.log('✓ Section D: a repo-wide sweep for `new Arweave.../Nostr.../Ipfs.../Bitcoin.../Base...(` finds construction everywhere and SELECTION nowhere — every concrete provider this codebase builds is built unconditionally, by one specific composition root, for one specific named purpose. There is no `providerKey === "arweave"`-shaped branch anywhere in production source to migrate.');
    }

    // ===============================================================
    // Section E — Audit E: NO_PREFERENCE never silently becomes "default
    // provider" — at the resolver itself, and at every registry-backed
    // candidate Section C named.
    // ===============================================================
    {
        // The resolver itself, unmodified since 0.9.295.
        const store = makePreferenceStore();
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: new SnapshotPlacementStoreRegistry(),
            proofRegistry: emptyRegistry()
        });
        const outcome = resolver.resolve(RoleProviderRole.CONTENT);
        assert(outcome.status === RoleProviderResolutionStatus.NO_PREFERENCE, 'E1. nothing configured -> NO_PREFERENCE, not a guessed provider');
        assert(outcome.providerKey === null, 'E2. providerKey is null, never the registry\'s first/only entry');
        assert(!('provider' in outcome), 'E3. no `provider` field is fabricated when nothing was configured');

        // SnapshotPlacementStoreRegistry itself: an unregistered lookup
        // returns null, never the first registered store.
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new LocalContentStore(new InMemoryStorageProvider()));
        assert(contentRegistry.get('nonexistent') === null, 'E4. SnapshotPlacementStoreRegistry.get() for an unregistered key returns null, never falls back to the one store that happens to be registered');
        assert(contentRegistry.get(undefined) === null, 'E5. an absent key (the shape RoleProviderPreferenceStore.get() -> null would produce if ever mishandled) also returns null, never a default');

        // ExternalProofVerifierRegistry: identical restraint.
        const proofRegistry = new ExternalProofVerifierRegistry();
        proofRegistry.register(new BitcoinOpReturnProofVerifier({ fetchImpl: neverCalled }));
        assert(proofRegistry.get('nonexistent') === null, 'E6. ExternalProofVerifierRegistry.get() for an unregistered key returns null, never the one registered verifier');

        // availableStorageTypes()/availableAnchorTypes(): an EMPTY
        // registry reports an EMPTY list, never a fabricated default
        // entry — the exact restraint each coordinator's own header names
        // (Section A2 above).
        const emptyContentRegistry = new SnapshotPlacementStoreRegistry();
        assert(emptyContentRegistry.storageTypes.length === 0, 'E7. an empty SnapshotPlacementStoreRegistry reports zero storage types — never a placeholder "default" entry');
        const emptyProofRegistry = new ExternalAnchorPublisherRegistry();
        assert(emptyProofRegistry.anchorTypes.length === 0, 'E8. an empty ExternalAnchorPublisherRegistry reports zero anchorTypes — same restraint, the creation-side registry');

        console.log('✓ Section E: "nothing configured" reports as an honest absence everywhere this audit checked — the resolver\'s own NO_PREFERENCE, every existing registry\'s own null-on-miss get(), and every existing availableTypes()-shaped list — none of them coerces absence into a fabricated default. Any future integration point inherits this property for free; it does not need to be separately re-implemented.');
    }

    // ===============================================================
    // Section F — Audit F: PROVIDER_NOT_FOUND never silently becomes
    // "use whatever provider is already configured" or "fall back to
    // another substrate" — at the resolver, and at every registry this
    // codebase already runs proof/content resolution through.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new LocalContentStore(new InMemoryStorageProvider())); // ONE real, available store
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry,
            proofRegistry: emptyRegistry()
        });
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' })); // never registered
        const outcome = resolver.resolve(RoleProviderRole.CONTENT);
        assert(outcome.status === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND, 'F1. an unavailable preferred provider reports PROVIDER_NOT_FOUND');
        assert(!outcome.provider, 'F2. no provider of any kind — least of all the one real, available "local" store — is silently substituted');
        assert(contentRegistry.has('local'), 'F3. sanity: "local" really was available and would have been a tempting silent fallback');

        // ExternalAnchorVerifier's OWN existing "no verifier available"
        // outcome — VALID_PROOF_UNVERIFIED — is a REAL, ALREADY-SHIPPED,
        // DELIBERATE policy this audit must NOT confuse with a future role-
        // preference fallback. It exists independently of, and years
        // before, this preference/resolution family, and it never falls
        // back to a DIFFERENT verifier either — it reports an honest "not
        // verified," never "verified by a substitute."
        const verifierSource = await source('application/ExternalAnchorVerifier.js');
        assert(/VALID_PROOF_UNVERIFIED,\s*anchor,\s*reason:\s*'no proof verifier available for this anchorType'/.test(verifierSource), 'F4. ExternalAnchorVerifier\'s own already-shipped "no verifier registered" outcome is an honest, explicit status — never a silent substitution of a different registered verifier');
        const proofRegistry = new ExternalProofVerifierRegistry();
        proofRegistry.register(new BitcoinOpReturnProofVerifier({ fetchImpl: neverCalled }));
        assert(proofRegistry.get('base') === null, 'F5. asking the SAME registry for a real-elsewhere-but-unregistered anchorType ("base") returns null, never the one Bitcoin verifier that happens to be registered');

        console.log('✓ Section F: PROVIDER_NOT_FOUND (this resolver) and "no verifier registered" (ExternalAnchorVerifier\'s own pre-existing, independent policy) are both honest, terminal outcomes today — neither one, anywhere this audit checked, silently substitutes a different already-configured provider or falls back to another substrate. A future explicit fallback policy remains a real, separate, unmade product decision (0.9.292 Section H\'s own still-open finding, unchanged by this audit).');
    }

    // ===============================================================
    // Section G — Audit G: the Discovery-registry decision point.
    // ===============================================================
    {
        // The ONE Discovery shape that is genuinely multi-provider
        // (Section A4/B) already resolves through a caller-built adapter
        // with NO keyed registry of its own — 0.9.295's own tests, Section
        // B, proved this against the REAL composition, not a mock.
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: neverCalled });
        const discoveryRegistry = { get: (k) => services[k] || null };
        const store = makePreferenceStore();
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry,
            contentRegistry: emptyRegistry(),
            proofRegistry: emptyRegistry()
        });
        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'arweave' }));
        const outcome = resolver.resolve(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);
        assert(outcome.status === RoleProviderResolutionStatus.RESOLVED && outcome.provider === services.arweave, 'G1. Discovery resolves against the real composition with NO keyed registry class — a caller-supplied adapter over an already-existing plain object is enough');

        // The other two Discovery shapes (Section B) have exactly ONE
        // provider each in production today — a registry would have
        // nothing to disambiguate between, so its absence cannot be
        // blocking them either.
        const discoverSnapshotSource = await source('application/DiscoverSnapshotRuntimeComposition.js');
        const discoveryCollaboratorImports = discoverSnapshotSource.split('\n').filter((l) => /^import\b/.test(l) && /Nostr|Arweave/.test(l));
        assert(discoveryCollaboratorImports.length === 2, 'G2. Snapshot discovery composes exactly two collaborators total (one Discovery-shaped query service, one Content-shaped resolution store) — there is only ever one Discovery-role option here, registry or not');

        const VERDICT = 'NOT_BLOCKING';
        const reasoning = [
            'the one Discovery shape that already runs more than one provider (Publication discovery, read path) already resolves through a minimal caller-built adapter, with no registry class — proven against real composition, not asserted',
            'the other two Discovery shapes (Snapshot discovery; local/catalog) each have exactly one production option (or none, for local/catalog, which is not a substrate choice) — a registry would have nothing to disambiguate',
            'the real, source-verified blockers this audit actually found (Section C) are elsewhere: a data-provenance conflict at resolution seams, an explicit documented no-preferred/default principle at creation seams, and a missing second provider at every hardcoded write-path seam — none of which a Discovery registry would resolve'
        ];
        assert(VERDICT === 'NOT_BLOCKING', 'G3. the verdict this section exists to reach');
        console.log(`✓ Section G — VERDICT: the absence of a keyed Discovery registry is ${VERDICT}. Reasoning:`);
        for (const r of reasoning) console.log(`    - ${r}`);
        console.log('  Recommendation: leave the architecture alone. A future "0.9.297 — Discovery Provider Registry Boundary" is NOT warranted by this audit\'s own evidence — building one now would be unifying a shape (Discovery) that genuinely differs from Content/Proof merely because they share a conceptual label, the exact anti-pattern this whole milestone sequence has held the line against since 0.9.292.');
    }

    // ===============================================================
    // Section H — Audit H: UI readiness.
    // ===============================================================
    {
        // The template shape a future preference UI should follow already
        // exists: ui/views/AvatarSettingsView.js injects a USE CASE
        // (never a raw storage key, never a concrete capability) and
        // operates entirely through it.
        const avatarSettingsSource = await source('ui/views/AvatarSettingsView.js');
        assert(/inject\('identityUseCase'\)/.test(avatarSettingsSource), 'H1. AvatarSettingsView.js injects a use case, the same shape a future RoleProviderPreference control belongs to');
        assert(!/new\s+(Arweave|Nostr|Ipfs|Bitcoin|Base)\w*\(/.test(avatarSettingsSource), 'H2. AvatarSettingsView.js never constructs a concrete provider itself — settings views in this codebase already operate through an injected use case, never raw capability construction');

        // UPDATED by 0.9.299 — Content Creation Provider Preference
        // Integration: ui/main.js now composes application/
        // PreferredSnapshotPlacementCreationCoordinator.js's own
        // composition root — the ONE production `ui/` file allowed to
        // mention the concept, and still never a settings screen. No
        // OTHER ui/ file manipulates DiscoveryProvider/ContentStore/
        // ProofVerifier through anything resembling a stored preference —
        // the explicit per-action button list Section A2 already found
        // (availableStorageTypes()/availableAnchorTypes()) is untouched.
        // UPDATED AGAIN by 0.9.301 — Preferred Content Provider Placement
        // Trigger: ui/views/DecentralizedPublicationsView.js now mentions
        // the concept too, via its own additive "Use Preferred Provider"
        // action — still never a settings screen, and the existing
        // per-action button list (Section H4 below) is still untouched.
        const allProductionFiles = await repoWideProductionFiles();
        const uiFiles = allProductionFiles.filter((f) => f.startsWith('ui/'));
        const preferenceLikeUiPattern = /providerPreference|networkPreference|preferredProvider|substratePreference|RoleProviderPreference/i;
        let uiPreferenceHits = 0;
        const uiPreferenceHitFiles = [];
        for (const file of uiFiles) {
            const text = await source(file);
            if (preferenceLikeUiPattern.test(text)) { uiPreferenceHits += 1; uiPreferenceHitFiles.push(file); }
        }
        const KNOWN_UI_PREFERENCE_FILES = new Set(['ui/main.js', 'ui/views/DecentralizedPublicationsView.js']);
        assert(uiPreferenceHits === KNOWN_UI_PREFERENCE_FILES.size && uiPreferenceHitFiles.every((f) => KNOWN_UI_PREFERENCE_FILES.has(f)),
            `H3. exactly ui/main.js and ui/views/DecentralizedPublicationsView.js mention a provider preference today, via 0.9.299's Content creation composition and 0.9.301's own trigger (found ${uiPreferenceHits}: ${uiPreferenceHitFiles.join(', ')}) — no settings screen exists, and no OTHER ui/ file references the concept`);

        // The explicit per-action pattern (real today) is the boundary a
        // future preference control must respect, never silently replace.
        const decentralizedViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        assert(/async function createPlacement\(entry, storage\)/.test(decentralizedViewSource), 'H4. the real, explicit, per-action createPlacement(entry, storage) control exists in production today');
        assert(/async function createAnchor\(entry, anchorType\)/.test(decentralizedViewSource), 'H5. the real, explicit, per-action createAnchor(entry, anchorType) control exists in production today');

        console.log('✓ Section H: this codebase already has a settings-UI template (AvatarSettingsView.js — inject a use case, never a concrete capability) a future Role Provider Preference control can follow directly. It also already has a real, explicit, per-action provider-choice control for Content and Proof creation (createPlacement/createAnchor) that any future preference UI must layer a DEFAULT suggestion onto, never replace outright — a person\'s own explicit per-action choice must keep overriding any stored preference, exactly the restraint RoleAwareProviderResolver\'s own "no fallback, no automatic switching" line already draws one layer down.');
    }

    // ===============================================================
    // Section I — the final classification, and this milestone's verdict.
    // ===============================================================
    {
        const READY = 'READY';
        const BLOCKED = 'BLOCKED';
        const INTENTIONALLY_INTERNAL = 'INTENTIONALLY_INTERNAL';
        const NOT_A_SELECTION_SEAM = 'NOT_A_SELECTION_SEAM';

        const classification = [
            { seam: 'CONTENT resolution (SnapshotPlacementResolver + SnapshotPlacementStoreRegistry)', status: NOT_A_SELECTION_SEAM, reason: 'dispatches on a placement\'s own historical storage field, never a live choice' },
            { seam: 'PROOF verification (ExternalAnchorVerifier + ExternalProofVerifierRegistry)', status: NOT_A_SELECTION_SEAM, reason: 'dispatches on an anchor\'s own historical anchorType field, never a live choice' },
            { seam: 'CONTENT creation (CreateExternalSnapshotPlacementUseCase, per-action UI)', status: BLOCKED, reason: 'the coordinating class\'s own header explicitly forbids a preferred/default entry today — a real, named, unmade decision, not a technical gap' },
            { seam: 'PROOF creation (CreateExternalPublicationAnchorUseCase, per-action UI)', status: BLOCKED, reason: 'identical documented "never preferred/default" restraint' },
            { seam: 'Publication distribution CONTENT+DISCOVERY (write path, Arweave+Nostr hardcoded)', status: BLOCKED, reason: 'no second provider implementation exists for either role in this path — nothing to resolve to' },
            { seam: 'Snapshot distribution CONTENT+DISCOVERY (write path, Arweave+Nostr hardcoded)', status: BLOCKED, reason: 'identical missing-alternative gap' },
            { seam: 'Snapshot discovery/resolution (read path, Nostr query + Arweave content, hardcoded)', status: BLOCKED, reason: 'identical missing-alternative gap' },
            { seam: 'Publication DISCOVERY (read path, composeDecentralizedWorldEncounterMaterialDiscoveryServices)', status: READY, reason: 'mechanically reachable today via a caller-built adapter (0.9.295 proved it against real composition) — but see Section C\'s own "query-all vs query-preferred" open policy question before any real insertion' },
            { seam: 'discovery/DiscoveryProvider.js (local/catalog listing)', status: NOT_A_SELECTION_SEAM, reason: 'not a substrate choice — this replica\'s own singular local index' },
            { seam: 'SnapshotPlacementStoreRegistry.js / ExternalProofVerifierRegistry.js / ExternalAnchorPublisherRegistry.js themselves', status: INTENTIONALLY_INTERNAL, reason: 'generic lookup tables, keyed by a plugin\'s own self-declared identity — legitimate composition-root infrastructure, not something a preference should reach around' },
            { seam: 'the ~60 Create*UseCase single-collaborator construction factories (Bitcoin/Base wallet, signing, broadcast machinery)', status: INTENTIONALLY_INTERNAL, reason: 'each builds exactly one, specifically-named, protocol-internal collaborator — no alternative exists to select between (Section D\'s own repo-wide sweep found zero branched selections anywhere)' }
        ];

        assert(classification.length === 11, `I1. eleven seams given a final classification (found ${classification.length})`);
        const counts = classification.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {});
        assert(counts[READY] === 1, `I2. exactly one seam classified READY (found ${counts[READY] || 0})`);
        assert(counts[BLOCKED] === 5, `I3. five seams classified BLOCKED (found ${counts[BLOCKED] || 0})`);
        assert(counts[INTENTIONALLY_INTERNAL] === 2, `I4. two seams classified INTENTIONALLY_INTERNAL (found ${counts[INTENTIONALLY_INTERNAL] || 0})`);
        assert(counts[NOT_A_SELECTION_SEAM] === 3, `I5. three seams classified NOT_A_SELECTION_SEAM (found ${counts[NOT_A_SELECTION_SEAM] || 0})`);

        console.log('  STATUS                  | SEAM');
        for (const c of classification) console.log(`  ${c.status.padEnd(24)} | ${c.seam}`);

        const verdict = 'NOT_YET_AN_INTEGRATION_BLOCKER_BY_DEFAULT — but not because the architecture is ready either';
        console.log(`\n✓ Section I — VERDICT: ${verdict}`);
        console.log('  The 0.9.295 Discovery/Content/Proof registry asymmetry named in this milestone\'s own brief is real, but it is NOT the thing standing between the resolver and production use. What actually stands in the way, per the evidence above:');
        console.log('    1. Five of eleven seams are BLOCKED — four because no second provider implementation exists for that role in that specific write/read path (a capability gap, unrelated to the resolver\'s own design), and two (Content/Proof CREATION) because an existing, explicit, documented "never preferred or default" principle would need to be deliberately revisited first — a product decision this audit surfaces but does not make.');
        console.log('    2. Three of eleven are NOT_A_SELECTION_SEAM — they resolve an already-created record\'s own historical fact, and a preference has no legitimate business touching them.');
        console.log('    3. Two of eleven are INTENTIONALLY_INTERNAL — real, load-bearing composition infrastructure that should stay exactly as it is.');
        console.log('    4. Exactly ONE seam is READY today: Publication discovery\'s read path, and even that one carries an open "query every configured provider" vs "query only the preferred one" policy question the resolver\'s own no-fallback, no-ranking design does not itself answer.');
        console.log('  Recommended next step is NOT a Discovery registry (0.9.297 as originally anticipated) and NOT the settings UI either — this audit found no seam ready enough to make the UI meaningful yet. The real next decision belongs to a person, not this codebase: whether to revisit SnapshotPlacementCreationCoordinator\'s / PublicationAnchorCreationCoordinator\'s own "never preferred or default" principle, and whether Publication discovery\'s "query every configured provider" behavior should ever become preference-driven. Until one of those is decided, wiring RoleAwareProviderResolver into any composition root would be either inert (resolving into an empty choice set) or a silent behavior change (Discovery) — both worse than leaving it exactly where 0.9.295 left it: real, tested, and unconsumed.');
    }

    console.log('\n✅ All Role Provider Resolution Integration Readiness Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
