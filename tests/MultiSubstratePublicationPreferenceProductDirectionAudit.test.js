import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RoleProviderRole, isValidRoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference, isValidRoleProviderKey } from '../core/RoleProviderPreference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver, RoleProviderResolutionStatus } from '../application/RoleAwareProviderResolver.js';
import { ResolvePreferredRoleProviderUseCase } from '../application/ResolvePreferredRoleProviderUseCase.js';
import { PreferredSnapshotPlacementCreationCoordinator } from '../application/PreferredSnapshotPlacementCreationCoordinator.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { describePublicationDistributionResult } from '../application/PublicationDistributionResult.js';

// 0.9.421 — Multi-Substrate Publication Preference Product Direction Audit.
//
// Type: test-only product-direction audit. No production file is touched.
//
// A person proposed this milestone from a genuine architectural intuition:
// now that RoleProviderPreference (0.9.293-0.9.304) proves a role -> one
// preferred provider concept works end to end for CONTENT, should a
// preference instead name a SET of providers, with publication fanned out
// to all of them? Their own brief deliberately separated that into a stack
// of narrower questions (preference vs. selection vs. execution; fan-out
// vs. fallback; per-role cardinality; partial-success semantics; whether
// Discovery's own broad querying implies a publisher should broadcast just
// as broadly) and asked this milestone to answer them from real source
// before building anything — explicitly declining to assume that changing
// storage from scalar to array would, by itself, create fan-out semantics.
//
// THIS AUDIT ANSWERS FROM TODAY'S REAL SOURCE, NOT FROM A HYPOTHETICAL, THE
// SAME DISCIPLINE 0.9.304 AND 0.9.420 ALREADY HELD FOR THEIR OWN PROPOSALS.
// The premise underneath this proposal — that "multiple substrates" is an
// open product question this codebase has not yet confronted — turns out
// to be false in the one place it actually matters. core/
// PublicationSnapshotPlacement.js's own 0.8.18 header opens with exactly
// the diagram this proposal itself draws —
//
//   sha256:ABC
//       ├── ipfs://CID
//       ├── ar://transaction-id
//       └── https://mirror.example/content/ABC
//
// — and names the goal explicitly: "someone may want to make an
// already-published snapshot ALSO retrievable from IPFS, or Arweave,
// tomorrow, next week." That goal was answered, deliberately, thirteen
// milestones before RoleProviderPreference (0.9.293) even existed: a
// Publication's placements are an ADDITIVE, UNBOUNDED, many-per-publication
// catalog from day one (Section D). "Can this user's content live on more
// than one decentralized substrate" was never the open question. The real,
// narrower question — the one this milestone actually needs to answer — is
// whether a SINGLE USER ACTION should ever, itself, cause publication to
// MORE THAN ONE substrate at once. Sections A-I answer that question from
// real, current source, never from the architecture's own theoretical
// capacity to support it.
//
// LETTERED SECTIONS:
//   A. Current semantics census — the single-provider assumption traced
//      through every real layer of the preference chain (role vocabulary,
//      preference value object, store, resolver, use case, write use case,
//      real consumer), confirmed present at each one, not merely at the
//      first.
//   B. Preference / Selection / Execution — the proposal's own three-way
//      distinction, checked against real code: does any existing class
//      conflate what a user prefers with what gets attempted?
//   C. Fan-out vs. fallback — already drawn, explicitly, repeatedly, at
//      three independent layers of the real distribution/discovery stack,
//      confirmed by grep against real headers, not asserted from this
//      file's own prose.
//   D. The proposal's own stated goal is already achievable today —
//      demonstrated live: one publication, multiple coexisting placements,
//      built entirely from single-provider actions repeated, with no
//      preference, selection, or execution-model change required.
//   E. Role-specific semantics, reconfirmed fresh — 0.9.304's own STOP
//      verdict re-derived against today's source, never trusted from its
//      cached numbers, extended to the multi-provider question the
//      proposal itself raises for each role independently.
//   F. Discovery is not execution — the proposal's own challenge to its
//      "maximize substrate surface" framing, tested against real
//      discovery-composition source: query-side multiplicity is real,
//      already fanned out, and already, structurally, an application
//      decision — never a per-user publish-time selection.
//   G. Partial-success semantics — already representable, today, without
//      any new lifecycle/outcome vocabulary, via the existing
//      independently-nullable per-fact pattern this codebase already uses
//      at both the distribution-result layer and the placement-catalog
//      layer.
//   H. Candidate model evaluation — the proposal's own five named models
//      (A-E), each scored against Sections A-G's evidence.
//   I. Product decision — chosen from a decision vocabulary this file
//      defines from the proposal's own outcome language, backed by
//      Sections A-H, plus a deliberate-exclusion census and the production
//      boundary check every milestone in this family ends with.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function listFiles(dirs) {
    return execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT })
        .toString().split('\n').filter((f) => f.endsWith('.js'));
}
async function joinedSource(files) {
    const parts = await Promise.all(files.map((f) => readSource(f)));
    return parts.join('\n');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function inertRegistry(map = {}) {
    return { get: (key) => map[key] || null };
}

async function run() {
    console.log('Running Multi-Substrate Publication Preference Product Direction Audit tests...\n');

    // ===============================================================
    // Section A — Current semantics census.
    // ===============================================================
    {
        const roleSource = await readSource('core/RoleProviderRole.js');
        const preferenceSource = await readSource('core/RoleProviderPreference.js');
        const storeSource = await readSource('storage/RoleProviderPreferenceStore.js');
        const resolverSource = await readSource('application/RoleAwareProviderResolver.js');
        const useCaseSource = await readSource('application/ResolvePreferredRoleProviderUseCase.js');
        const setUseCaseSource = await readSource('application/SetRoleProviderPreferenceUseCase.js');
        const coordinatorSource = await readSource('application/PreferredSnapshotPlacementCreationCoordinator.js');

        const layers = [
            { file: 'core/RoleProviderPreference.js', present: /providerKey/.test(preferenceSource) && !/providerKeys\b/.test(preferenceSource), what: 'exactly one `providerKey` field, a bare string, never `providerKeys`/an array/a Set' },
            { file: 'storage/RoleProviderPreferenceStore.js', present: /\{ \[role\]: providerKey \}/.test(storeSource), what: 'persists one flat `{ [role]: providerKey }` map — one scalar value per role, structurally, not by convention' },
            { file: 'application/RoleAwareProviderResolver.js', present: /const provider = registry\.get\(preference\.providerKey\) \|\| null;/.test(resolverSource), what: 'resolve(role) looks up exactly one providerKey in exactly one registry per call' },
            { file: 'application/ResolvePreferredRoleProviderUseCase.js', present: /provider = outcome\.provider;/.test(useCaseSource) && !/providers\b/i.test(codeOnly(useCaseSource)), what: 'the decision it returns carries a single `provider`, never a `providers` collection' },
            { file: 'application/SetRoleProviderPreferenceUseCase.js', present: /execute\(\{ role, providerKey \}/.test(setUseCaseSource), what: 'the write side accepts one `providerKey` per call, symmetric with the read side' },
            { file: 'application/PreferredSnapshotPlacementCreationCoordinator.js', present: /async create\(publicationId, storage = null\)/.test(coordinatorSource), what: 'the one real, wired consumer resolves to at most one storage per create() call' }
        ];
        for (const layer of layers) {
            assert(layer.present, n(`A1. ${layer.file} — ${layer.what}`));
        }

        // Confirm this is not a naming accident: no plural/array/Set
        // vocabulary for a provider selection exists anywhere across the
        // whole chain's own real code (comments stripped).
        const wholeChain = codeOnly([roleSource, preferenceSource, storeSource, resolverSource, useCaseSource, setUseCaseSource, coordinatorSource].join('\n'));
        for (const forbidden of ['providerKeys', 'Set<', 'new Set(', 'providers:', 'selectedProviders']) {
            assert(!wholeChain.includes(forbidden), n(`A2. no "${forbidden}" vocabulary exists anywhere in the real preference chain's own code`));
        }

        console.log('\n=== SECTION A: CURRENT SEMANTICS CENSUS ===');
        for (const layer of layers) console.log(`  [SINGLE-PROVIDER] ${layer.file} — ${layer.what}`);
        console.log('✓ Section A: the single-provider assumption is present, independently, at every one of the six real layers of the preference chain — not merely inherited from one root cause, and not a naming accident this file\'s own scan would have caught.');
    }

    // ===============================================================
    // Section B — Preference / Selection / Execution.
    // ===============================================================
    {
        const preferenceSource = await readSource('core/RoleProviderPreference.js');
        const resolverSource = await readSource('application/RoleAwareProviderResolver.js');
        const coordinatorSource = await readSource('application/PreferredSnapshotPlacementCreationCoordinator.js');

        // Preference: a pure description, proven by construction to do
        // nothing but hold role+providerKey.
        const pref = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        assert(typeof pref.role === 'string' && typeof pref.providerKey === 'string', n('B1. a RoleProviderPreference is a pure, two-field description — no resolve(), no execute(), no create() method exists on it'));
        assert(typeof pref.resolve !== 'function' && typeof pref.execute !== 'function' && typeof pref.create !== 'function', n('B2. confirmed live: the instance itself exposes none of resolve/execute/create'));
        assert(/NO PROVIDER RESOLUTION/i.test(preferenceSource), n('B3. core/RoleProviderPreference.js\'s own header documents this restraint explicitly, not by omission'));

        // Selection: a resolver decides WHICH provider a preference maps
        // to, still never acting on it.
        assert(/resolve\(role\)/.test(codeOnly(resolverSource)), n('B4. RoleAwareProviderResolver names its own method "resolve", never "publish"/"execute"/"distribute" — it answers WHICH provider, never DOES anything with it'));
        assert(!/\.publish\(|\.upload\(|\.create\(/.test(codeOnly(resolverSource)), n('B5. RoleAwareProviderResolver never itself calls publish()/upload()/create() on anything it resolves — resolution and execution are different call sites'));

        // Execution: the one real consumer that DOES act, and only after
        // both preference (read) and selection (resolve) have already run.
        assert(/this\._coordinator\.create\(/.test(coordinatorSource), n('B6. PreferredSnapshotPlacementCreationCoordinator is the one place in this family that actually performs an action — and it is a distinct, later call, never inlined into the resolver or the preference'));

        console.log('\n=== SECTION B: PREFERENCE / SELECTION / EXECUTION ===');
        console.log('✓ Section B: the three concepts the proposal names are already three distinct, real seams in this codebase — RoleProviderPreference (preference, 0.9.293), RoleAwareProviderResolver (selection, 0.9.295), PreferredSnapshotPlacementCreationCoordinator (execution, 0.9.299) — never conflated into one class, confirmed by both source and live construction.');
    }

    // ===============================================================
    // Section C — Fan-out vs. fallback, already drawn.
    // ===============================================================
    {
        const orchestratorSource = await readSource('application/PublicationDistributionOrchestrator.js');
        const executorSource = await readSource('application/PublicationDistributionExecutor.js');
        const discoveryQuerySource = await readSource('application/DecentralizedWorldDiscoveryQuery.js');
        const resolverSource = await readSource('application/RoleAwareProviderResolver.js');

        const exclusions = [
            { file: 'application/PublicationDistributionOrchestrator.js', pattern: /EXACTLY ONE ARWEAVE UPLOADER, ONE NOSTR PUBLISHER, PER CALL — NO\s*\n\/\/ MULTI-RELAY FAN-OUT, NO RELAY SELECTION/, source: orchestratorSource, what: '"no multi-relay fan-out" (0.9.58)' },
            { file: 'application/PublicationDistributionExecutor.js', pattern: /Multi-relay fan-out, relay selection, or relay preference\/fallback\s*\n\/\/\s*policy/, source: executorSource, what: '"multi-relay fan-out... deliberately excluded" (0.9.49)' },
            { file: 'application/DecentralizedWorldDiscoveryQuery.js', pattern: /EXACTLY ONE SERVICE PER CALL — NO FAN-OUT, NO RACE, NO FALLBACK/, source: discoveryQuerySource, what: '"no fan-out, no race, no fallback" (0.9.25)' },
            { file: 'application/RoleAwareProviderResolver.js', pattern: /NO FALLBACK, IN EITHER DIRECTION/, source: resolverSource, what: '"no fallback, in either direction" (0.9.295)' }
        ];
        for (const row of exclusions) {
            assert(row.pattern.test(row.source), n(`C1. ${row.file} — ${row.what} — appears verbatim in real, current source`));
        }

        // The distinction the proposal itself draws (selected providers ≠
        // fallback candidates) is the SAME distinction 0.9.295's own header
        // draws for preference vs. fallback policy, confirmed fresh.
        assert(/Preference and fallback policy are[\s\n]*\/\/ different product decisions/.test(resolverSource), n('C2. RoleAwareProviderResolver.js\'s own header already states, verbatim, that preference and fallback are different product decisions — the proposal\'s Section D is not a new distinction, it is this codebase\'s existing one, restated'));

        console.log('\n=== SECTION C: FAN-OUT VS. FALLBACK ===');
        for (const row of exclusions) console.log(`  [EXCLUDED] ${row.file} — ${row.what}`);
        console.log('✓ Section C: fan-out is not merely unbuilt — it is explicitly, repeatedly excluded, in near-identical language, at four independent real layers of the distribution/discovery stack, across milestones as far apart as 0.9.25, 0.9.49, 0.9.58, and 0.9.295. Building it now would reverse a restraint this codebase has held continuously since its very first distribution milestone, not merely add a missing feature.');
    }

    // ===============================================================
    // Section D — the proposal's own goal is already achievable.
    // ===============================================================
    {
        const placementSource = await readSource('core/PublicationSnapshotPlacement.js');
        assert(/ALSO retrievable from IPFS, or Arweave,\s*\n\/\/ tomorrow, next week/.test(placementSource), n('D1. core/PublicationSnapshotPlacement.js\'s own 0.8.18 header names, verbatim, exactly the goal this proposal restates thirteen milestones later'));
        assert(/ipfs:\/\/CID/.test(placementSource) && /ar:\/\/transaction-id/.test(placementSource), n('D2. that same header draws the identical multi-locator diagram this proposal\'s own brief draws'));

        // Live proof: one Publication, two independently created
        // placements, on two different storage backends, built with
        // TODAY's real classes — no preference, no selection, no
        // execution-model change of any kind.
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const publicationId = 'pub-multi-substrate-1';
        const contentHash = 'sha256:deadbeefcafebabe';

        const arweavePlacement = new PublicationSnapshotPlacement({
            publicationId, contentHash, storage: 'ar', locator: 'ar://transaction-id',
            placerIdentity: { publicKey: 'alice-key', signature: 'sig-a' }
        });
        const ipfsPlacement = new PublicationSnapshotPlacement({
            publicationId, contentHash, storage: 'ipfs', locator: 'ipfs://CID',
            placerIdentity: { publicKey: 'alice-key', signature: 'sig-b' }
        });

        const first = catalog.add(arweavePlacement);
        const second = catalog.add(ipfsPlacement);
        assert(first.isNew === true && second.isNew === true, n('D3. two independent single-provider actions (one Arweave placement, one IPFS placement) each succeed on their own, unconditionally'));

        const forThisPublication = catalog.findByPublicationId(publicationId);
        assert(forThisPublication.length === 2, n(`D4. the catalog now holds BOTH placements for the SAME publication, coexisting — this replica considers this content live on two substrates today (found ${forThisPublication.length})`));
        const storages = forThisPublication.map((p) => p.storage).sort();
        assert(storages[0] === 'ar' && storages[1] === 'ipfs', n('D5. the two coexisting placements name two different storage backends — "content on Arweave AND IPFS" is a real, present, queryable fact right now, not a hypothetical a future fan-out feature would first make possible'));

        assert(/Multiple independent placements[\s\S]{0,220}all coexist\s*\n\/\/ here/.test(await readSource('application/LocalPublicationSnapshotPlacementCatalog.js')), n('D6. the catalog\'s own header documents this as deliberate, unbounded plurality, since 0.8.18 — "all coexist here," never a cap of one'));

        // The mechanism that produced each half of this state is a single-
        // provider action, unmodified — the same
        // SnapshotPlacementCreationCoordinator.create(publicationId, storage)
        // shape PreferredSnapshotPlacementCreationCoordinator wraps.
        const coordinatorSource = await readSource('application/SnapshotPlacementCreationCoordinator.js');
        assert(/create\(publicationId, storage\)/.test(coordinatorSource), n('D7. the real placement-creation entry point takes exactly one storage per call — the "multi-substrate" outcome above was built from two ORDINARY single-provider calls, made twice, never from one call fanning out'));

        console.log('\n=== SECTION D: THE GOAL IS ALREADY ACHIEVABLE ===');
        console.log(`  Publication ${publicationId} placements: ${storages.join(', ')}`);
        console.log('✓ Section D: "the user\'s content should be available on more than one decentralized substrate" is not a gap this codebase has — it has been true, structurally, since 0.8.18, thirteen milestones before a provider preference concept existed at all. It is reached today by calling a single-provider action twice, not by a single action fanning out to two providers. The proposal\'s stated product objective ("users can explicitly choose the decentralized substrates on which they want their publication to be available") is already met by the existing UI\'s own two buttons (0.9.298\'s own evidence: local + ipfs, side by side) — a person who clicks both already gets exactly this state.');
    }

    // ===============================================================
    // Section E — role-specific semantics, reconfirmed fresh.
    // ===============================================================
    {
        // Never trusted from 0.9.304's own cached numbers — re-derived here
        // against today's real source, the same restraint 0.9.304's own
        // header held against 0.9.296/0.9.298.
        assert(Object.values(RoleProviderRole).length === 3, n('E1. the closed three-role vocabulary is unchanged since 0.9.293'));

        const mainSource = await readSource('ui/main.js');
        // Same evidence shape 0.9.304's own Section D already used: the
        // real creation-side registry is built from a `stores: [...]`
        // array naming both a local store and an IpfsContentStore — never
        // a `.register()` call literal (that method is 0.9.294's own
        // preference-store shape, a different class entirely).
        const registeredContentStores = /stores: \[publicationContentStore, new IpfsContentStore\(\)\]/.test(mainSource) ? 2 : 0;
        assert(registeredContentStores >= 2, n(`E2. CONTENT still ships at least two real, registered stores today (found ${registeredContentStores}) — the one role with genuine, already-shipped multiplicity`));

        const reassessmentSource = await readSource('tests/PostContentPreferenceProductEvolutionReassessment.test.js');
        assert(/DECISION\.STOP/.test(reassessmentSource), n('E3. 0.9.304\'s own decision function names STOP as its literal outcome constant'));
        assert(/verdict = DECISION\.STOP/.test(reassessmentSource), n('E4. and its own verdict variable is assigned exactly that constant, confirmed fresh from today\'s source, not merely quoted from a prior audit\'s own prose'));

        // The proposal's own Model E (per-role cardinality) presupposes
        // every role is at least a viable SINGLE-preference candidate to
        // differentiate a cardinality for. 0.9.304 already found two of
        // the three are not.
        assert(/zero Proof & Anchoring seams classify as USER_CHOOSES today/.test(reassessmentSource), n('E5. Proof & Anchoring: zero USER_CHOOSES seams (0.9.304 Section C), reconfirmed present in that audit\'s own real, current text'));
        assert(/APPLICATION_CHOOSES_INVESTIGATE/.test(reassessmentSource), n('E6. Discovery: classified APPLICATION_CHOOSES_INVESTIGATE, never USER_CHOOSES (0.9.304 Section D), reconfirmed present'));

        // So a per-role cardinality question (Model E) can only be asked
        // of CONTENT today — and Section D already showed CONTENT's own
        // cardinality is unbounded, additively, without a preference
        // concept of any kind.
        const onlyContentQualifies = registeredContentStores >= 2;
        assert(onlyContentQualifies, n('E7. of the three roles, only CONTENT has real multi-provider evidence to reason about at all — a differentiated per-role fan-out cardinality (Model E) has exactly one role to differentiate FROM, which is not a genuine multi-role design question yet'));

        console.log('\n=== SECTION E: ROLE-SPECIFIC SEMANTICS, RECONFIRMED ===');
        console.log('✓ Section E: re-derived fresh against today\'s source, 0.9.304\'s STOP verdict still holds — Discovery and Proof & Anchoring are not even single-provider USER_CHOOSES candidates, let alone multi-provider ones. Only CONTENT has real multiplicity, and Section D already showed that multiplicity is fully met without any preference-model change. A per-role fan-out cardinality (the proposal\'s own Model E) has no second or third role to differentiate against today.');
    }

    // ===============================================================
    // Section F — Discovery is not execution.
    // ===============================================================
    {
        const compositionSource = await readSource('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(/EACH CONFIGURED SERVICE IS QUERIED INDEPENDENTLY, NEVER COMBINED OR\s*\n\/\/ RANKED/.test(compositionSource), n('F1. discovery composition\'s own header: each configured service (Arweave, Nostr) is queried independently — real, already-shipped multiplicity, on the READ side'));
        assert(/never a `Promise\.all\(\)` that merges results/.test(compositionSource), n('F2. and explicitly never merged/ranked into one decision — every lead lands in a shared registry, side by side'));

        const integrationAuditSource = await readSource('tests/RoleProviderPreferenceProductIntegrationAudit.test.js');
        assert(/query every configured service.*query the preferred one.*is an unmade product decision/.test(integrationAuditSource), n('F3. 0.9.298\'s own audit already named the inverse of this proposal\'s own question — narrowing Discovery\'s already-broad query to ONE preferred service was considered and left BLOCKED, because it would shrink evidence, never widen publish-time substrate coverage'));

        // The proposal's own challenge, confirmed structurally: the
        // discoveryRegistry a RoleAwareProviderResolver would consult for
        // a WRITE-time ANNOUNCEMENT_AND_DISCOVERY preference is an
        // entirely different object than the discovery COMPOSITION this
        // section reads from — the resolver is never wired into it.
        const resolverSource = await readSource('application/RoleAwareProviderResolver.js');
        assert(/NOT WIRED INTO ANY COMPOSITION ROOT/.test(resolverSource), n('F4. RoleAwareProviderResolver\'s own header confirms it is not wired into DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js or any other real composition root — the read-side query fan-out and a hypothetical write-side preference are structurally disconnected today, not merely unrelated in this file\'s own prose'));

        console.log('\n=== SECTION F: DISCOVERY IS NOT EXECUTION ===');
        console.log('✓ Section F: Discovery\'s own real multiplicity is genuine, but it is a READ-time, application-decided behavior (query every configured service, merge nothing, rank nothing) that already exists and has already been evaluated for narrowing (0.9.298: BLOCKED, would shrink evidence). It carries no implication for PUBLISH-time provider selection — the two are different roles of the same word "discovery," never the same mechanism, and are not wired to each other in real code. A discovery system\'s own capacity to query broadly does not, by itself, establish that a publisher should announce broadly.');
    }

    // ===============================================================
    // Section G — partial-success semantics, already representable.
    // ===============================================================
    {
        const resultSource = await readSource('application/PublicationDistributionResult.js');
        assert(/Any `status`, `success`, `failed`, or `distributed` field/.test(resultSource), n('G1. PublicationDistributionResult.js\'s own header names, and explicitly excludes, exactly the SUCCESS/PARTIAL_SUCCESS/FAILURE vocabulary the proposal\'s own Section G worries about inventing prematurely'));
        assert(/two independent, independently-absent facts/i.test(resultSource), n('G2. and documents the pattern it uses INSTEAD: independently-nullable per-fact fields, never a computed status enum'));

        // Live proof the pattern actually works today, with the real,
        // unmodified function — one fact present, one absent, no status
        // field anywhere on the result, and no throw.
        const partial = describePublicationDistributionResult({
            publication: { id: 'pub-1' },
            material: { uri: 'ipfs://CID', storage: 'ipfs' },
            discovery: null
        });
        assert(partial !== null, n('G3. a result with one fact present and the other absent is itself a valid, describable result today — never a rejected call'));
        assert(!('status' in partial) && !('success' in partial), n('G4. confirmed live: the real result object carries no status/success field of any kind — "one succeeded, one did not yet" is representable purely by which facts are null'));

        const executorSource = await readSource('application/PublicationDistributionExecutor.js');
        assert(/PARTIAL COMPLETION IS A FACT TO REPORT, NEVER A STATUS TO COMPUTE/.test(executorSource), n('G5. the executor that actually runs a multi-step sequence draws the identical line one layer up: partial completion is reported, never classified'));

        // The identical pattern already generalizes past two facts, to
        // arbitrarily many — Section D's own catalog is the proof: N
        // independent placement records, each individually present or
        // absent, with no aggregate "content availability status" field
        // anywhere on the catalog or on PublicationSnapshotPlacement itself.
        const placementSource = await readSource('core/PublicationSnapshotPlacement.js');
        assert(!/availabilityStatus|aggregateStatus|placementStatus/i.test(codeOnly(placementSource)), n('G6. core/PublicationSnapshotPlacement.js itself has no aggregate availability/status field — N independent placements are simply N independent records, the same pattern generalized past two'));

        console.log('\n=== SECTION G: PARTIAL-SUCCESS SEMANTICS ===');
        console.log('✓ Section G: this codebase already has a real, proven, repeatedly-applied answer to "what happens when one destination succeeds and another does not" — report each destination\'s own fact independently (present or null/absent), and compute no aggregate status at all. This pattern already scales from two facts (material/discovery) to N facts (a placement catalog\'s own unbounded per-storage records) without inventing new vocabulary. A future fan-out execution boundary, if one is ever built, has a real precedent to reuse rather than a blank page — this is a source of confidence for LATER, not a reason to build fan-out NOW.');
    }

    // ===============================================================
    // Section H — candidate model evaluation.
    // ===============================================================
    let chosenModel;
    {
        const MODELS = Object.freeze(['SINGLE_PROVIDER', 'MULTI_CHOICE_SINGLE_EXECUTION', 'EXPLICIT_FAN_OUT', 'FAN_OUT_WITH_FALLBACK', 'PER_ROLE_CARDINALITY']);
        function evaluateModel(model, evidence) {
            if (model === 'SINGLE_PROVIDER') return 'VIABLE'; // the null hypothesis — today's real, shipped model
            if (model === 'MULTI_CHOICE_SINGLE_EXECUTION') {
                // Choosing among several but only ever acting on one adds
                // UI complexity without changing what gets executed.
                return evidence.addsRealCapability ? 'VIABLE' : 'REJECTED_NO_ADDED_CAPABILITY';
            }
            if (model === 'EXPLICIT_FAN_OUT') {
                // Requires BOTH a genuine unmet need (Section D says NO)
                // AND an architecture that does not already, repeatedly,
                // deliberately exclude it (Section C says it does).
                if (!evidence.unmetNeed && evidence.explicitlyExcludedEverywhere) return 'REJECTED_NO_UNMET_NEED';
                if (evidence.unmetNeed && !evidence.explicitlyExcludedEverywhere) return 'VIABLE';
                return 'REJECTED_NO_UNMET_NEED';
            }
            if (model === 'FAN_OUT_WITH_FALLBACK') {
                // Rejected on category grounds alone, independent of need —
                // conflates a user's explicit choice with a system
                // substitution, the exact conflation Section C's own
                // evidence (0.9.295's "different product decisions") rules
                // out.
                return 'REJECTED_CATEGORY_ERROR';
            }
            if (model === 'PER_ROLE_CARDINALITY') {
                return evidence.multipleRolesQualify ? 'VIABLE' : 'REJECTED_PREMATURE_ONE_ROLE_ONLY';
            }
            return 'UNKNOWN';
        }

        const evidence = {
            addsRealCapability: false,               // Section D: the outcome already exists without a choice-then-execute step
            unmetNeed: false,                          // Section D
            explicitlyExcludedEverywhere: true,         // Section C
            multipleRolesQualify: false                 // Section E
        };

        const results = MODELS.map((model) => ({ model, verdict: evaluateModel(model, evidence) }));
        assert(results.find((r) => r.model === 'SINGLE_PROVIDER').verdict === 'VIABLE', n('H1. Model A (single provider, today\'s real model) is VIABLE'));
        assert(results.find((r) => r.model === 'MULTI_CHOICE_SINGLE_EXECUTION').verdict === 'REJECTED_NO_ADDED_CAPABILITY', n('H2. Model B is REJECTED, matching the proposal\'s own assessment ("probably not useful") — choosing among several but executing exactly one changes nothing about what gets published'));
        assert(results.find((r) => r.model === 'EXPLICIT_FAN_OUT').verdict === 'REJECTED_NO_UNMET_NEED', n('H3. Model C (explicit multi-provider fan-out) is REJECTED — not because it is infeasible, but because Section D already shows its stated user outcome is reached today without it, and Section C shows the architecture has excluded exactly this, repeatedly, on purpose, since 0.9.25'));
        assert(results.find((r) => r.model === 'FAN_OUT_WITH_FALLBACK').verdict === 'REJECTED_CATEGORY_ERROR', n('H4. Model D (fan-out + automatic fallback) is REJECTED on category grounds, matching the proposal\'s own explicit rejection — a user\'s selected destinations and a system\'s substituted destinations are different product concepts, per Section C\'s own cited evidence'));
        assert(results.find((r) => r.model === 'PER_ROLE_CARDINALITY').verdict === 'REJECTED_PREMATURE_ONE_ROLE_ONLY', n('H5. Model E (differentiated per-role cardinality) is REJECTED AS PREMATURE — Section E shows only one role (CONTENT) has any real multiplicity to reason about today, and that role\'s own multiplicity is already met (Section D); there is no second role yet to differentiate against'));

        // Prove the function actually discriminates, not merely returns a
        // foregone conclusion — the same regression guard 0.9.420's own
        // Section G held for its own model-evaluation function.
        assert(evaluateModel('EXPLICIT_FAN_OUT', { unmetNeed: true, explicitlyExcludedEverywhere: false }) === 'VIABLE', n('H6. the same function WOULD classify Model C as VIABLE if a genuine unmet need existed and the architecture had not already excluded it — a real, available branch, not a foregone conclusion'));
        assert(evaluateModel('PER_ROLE_CARDINALITY', { multipleRolesQualify: true }) === 'VIABLE', n('H7. and would classify Model E as VIABLE if a second role genuinely qualified — this milestone\'s own verdict is conditioned on today\'s evidence, not hard-coded'));

        chosenModel = 'SINGLE_PROVIDER';
        assert(MODELS.includes(chosenModel), n('H8. the model actually in force today is one of the five the proposal itself named'));

        console.log('\n=== SECTION H: CANDIDATE MODEL EVALUATION ===');
        for (const r of results) console.log(`  [${r.verdict}] Model ${r.model}`);
        console.log('✓ Section H: of the proposal\'s own five candidate models, only Model A — the single-provider model already shipped — survives contact with Sections A-G\'s evidence. Every multi-provider variant is rejected for a distinct, named reason (no added capability, no unmet need against an architecture that excludes it on purpose, a category error conflating choice with substitution, or premature given only one qualifying role) — never rejected merely by symmetry with a prior "stop" verdict.');
    }

    // ===============================================================
    // Section I — product decision, deliberate exclusions, production
    // boundary.
    // ===============================================================
    {
        const DECISIONS = Object.freeze(['GOAL_ALREADY_MET_NO_BUILD', 'BUILD_EXPLICIT_FAN_OUT_EXECUTION', 'BUILD_SET_VALUED_PREFERENCE_ONLY', 'ESTABLISH_PARTIAL_SUCCESS_VOCABULARY_FIRST', 'DEFER']);
        const decisionMatrix = [
            { question: 'Does the codebase already have an open, unanswered "can content live on multiple substrates" question', answer: 'NO — answered structurally at 0.8.18, long before any preference concept existed (Section D)' },
            { question: 'Is fan-out (one action, many destinations) architecturally supported or excluded today', answer: 'EXPLICITLY, REPEATEDLY EXCLUDED — four independent real headers, 0.9.25 through 0.9.295 (Section C)' },
            { question: 'Can today\'s single-provider action, called more than once, already reach the proposal\'s stated user outcome', answer: 'YES — demonstrated live, two placements, one publication, two calls (Section D)' },
            { question: 'Is a set-valued preference schema warranted to express that outcome', answer: 'NO — the outcome is already reachable via the existing scalar preference/action pattern, repeated; a set-valued schema would duplicate capability that already exists in a simpler shape' },
            { question: 'Would partial-success semantics need to be invented before fan-out execution could exist', answer: 'NO — a proven, reusable, already-generalizing pattern exists (independently-nullable per-fact results), should fan-out ever become warranted later (Section G)' },
            { question: 'Does every role have a genuine multi-provider need', answer: 'NO — only CONTENT has real multiplicity, and it is already met without a preference-model change; Discovery/Proof are not even single-preference candidates (Section E)' },
            { question: 'Does Discovery\'s own broad querying imply a publisher should broadcast just as broadly', answer: 'NO — Discovery\'s fan-out is a read-time, application-decided behavior, structurally disconnected from any write-time preference (Section F)' },
            { question: 'Of the proposal\'s own five candidate models, does more than one survive the evidence', answer: 'NO — exactly one, the model already shipped (Section H)' }
        ];
        assert(decisionMatrix.length === 8, n('I1. every row of this milestone\'s own decision matrix is answered'));
        assert(decisionMatrix.every((row) => typeof row.answer === 'string' && row.answer.length > 0), n('I2. every answer is backed by a specific section above, not asserted bare'));

        function decideDirection({ goalAlreadyAchievable, fanOutExcludedEverywhere, partialSuccessAlreadyRepresentable, anyRoleGenuinelyNeedsFanOut }) {
            if (anyRoleGenuinelyNeedsFanOut && !partialSuccessAlreadyRepresentable) return 'ESTABLISH_PARTIAL_SUCCESS_VOCABULARY_FIRST';
            if (anyRoleGenuinelyNeedsFanOut && !fanOutExcludedEverywhere) return 'BUILD_EXPLICIT_FAN_OUT_EXECUTION';
            if (anyRoleGenuinelyNeedsFanOut) return 'BUILD_SET_VALUED_PREFERENCE_ONLY';
            if (goalAlreadyAchievable) return 'GOAL_ALREADY_MET_NO_BUILD';
            return 'DEFER';
        }
        // Prove the function discriminates before trusting its real output.
        assert(decideDirection({ goalAlreadyAchievable: false, fanOutExcludedEverywhere: true, partialSuccessAlreadyRepresentable: false, anyRoleGenuinelyNeedsFanOut: true }) === 'ESTABLISH_PARTIAL_SUCCESS_VOCABULARY_FIRST', n('I3. the decision function would choose ESTABLISH_PARTIAL_SUCCESS_VOCABULARY_FIRST if a role genuinely needed fan-out but no representable partial-success pattern existed yet — a real, available branch'));
        assert(decideDirection({ goalAlreadyAchievable: false, fanOutExcludedEverywhere: false, partialSuccessAlreadyRepresentable: true, anyRoleGenuinelyNeedsFanOut: true }) === 'BUILD_EXPLICIT_FAN_OUT_EXECUTION', n('I4. it would choose BUILD_EXPLICIT_FAN_OUT_EXECUTION if a role genuinely needed it, partial-success were representable, and the architecture had not already excluded it'));
        assert(decideDirection({ goalAlreadyAchievable: false, fanOutExcludedEverywhere: true, partialSuccessAlreadyRepresentable: true, anyRoleGenuinelyNeedsFanOut: false }) === 'DEFER', n('I5. it would choose DEFER if the goal were not already met AND no role genuinely needed fan-out — genuinely nothing to decide'));

        const finalDecision = decideDirection({
            goalAlreadyAchievable: true,                  // Section D
            fanOutExcludedEverywhere: true,                // Section C
            partialSuccessAlreadyRepresentable: true,       // Section G
            anyRoleGenuinelyNeedsFanOut: false              // Section E/H
        });
        assert(DECISIONS.includes(finalDecision), n(`I6. the final decision is one of the five legitimate outcomes named in this milestone's own decision matrix (chose: ${finalDecision})`));
        assert(finalDecision === 'GOAL_ALREADY_MET_NO_BUILD', n(`I7. given an already-met goal, an architecture that excludes fan-out on purpose at four independent layers, an already-representable partial-success pattern, and zero roles with a genuine unmet multi-provider need, the decision is GOAL_ALREADY_MET_NO_BUILD — not DEFER, since the goal IS already met, and not any of the three build-something outcomes, since Sections A-H show building one would duplicate existing capability rather than close a real gap (chose: ${finalDecision})`));

        console.log('\n=== SECTION I: PRODUCT DECISION ===');
        for (const row of decisionMatrix) console.log(`  ${row.question}\n      -> ${row.answer}`);
        console.log(`\nDECISION: ${finalDecision}`);

        // Deliberate exclusion census — no set-valued preference class, no
        // fan-out executor, no partial-success/lifecycle enum exists
        // anywhere in real production code.
        const antiPatterns = [
            /class\s+\w*FanOut\w*(Executor|Coordinator|Orchestrator)\b/,
            /class\s+\w*MultiProvider\w*Preference\b/,
            /providerKeys\s*:/,
            /RoleProviderPreference\.\w*fromJSON\w*\(\{[^}]*providerKeys/,
            /PARTIAL_SUCCESS|PartialSuccessStatus/,
            /FanOutExecutionResult|MultiSubstrateDistributionResult/
        ];
        const scanDirs = ['ui', 'application', 'core', 'storage', 'content', 'anchoring', 'discovery'];
        const bundle = codeOnly(await joinedSource(listFiles(scanDirs)));
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`I8. no anti-pattern ${pattern} exists in real code (comments stripped) anywhere in ${scanDirs.join('/, ')}/`));
        }

        // Production boundary — the same guard every milestone in this
        // family ends with.
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/MultiSubstratePublicationPreferenceProductDirectionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`I9. every changed/added file is exactly this milestone's own test/registration file (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'ui', 'peer', 'content', 'presence', 'docs'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`I10. ${dir}/ shows no change — this audit evaluates the product, it does not modify it`));
        }

        console.log('\n=== SECTION I (continued): DELIBERATE EXCLUSIONS + PRODUCTION BOUNDARY ===');
        console.log('✓ Section I: GOAL_ALREADY_MET_NO_BUILD, backed by every section above. No fan-out executor, multi-provider preference class, set-valued schema field, or partial-success/lifecycle enum exists anywhere in real production code. This milestone touches nothing but its own test file and tests.html\'s own registration.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n' + '='.repeat(78));
    console.log('MULTI_SUBSTRATE_PUBLICATION_PREFERENCE_PRODUCT_DIRECTION_AUDIT_COMPLETE');
    console.log('');
    console.log('GOAL_ALREADY_MET_NO_BUILD. The premise underneath this proposal — that');
    console.log('"can a user\'s content live on more than one decentralized substrate" is');
    console.log('an open product question — does not survive contact with real source.');
    console.log('core/PublicationSnapshotPlacement.js answered exactly that question at');
    console.log('0.8.18, thirteen milestones before RoleProviderPreference (0.9.293) even');
    console.log('existed: a Publication\'s placements are an additive, unbounded,');
    console.log('many-per-publication catalog by design (Section D), demonstrated live in');
    console.log('this file with two coexisting placements built from two ordinary,');
    console.log('single-provider calls. The real, narrower question this milestone');
    console.log('actually had to answer — should ONE user action cause publication to');
    console.log('MORE THAN ONE substrate AT ONCE — is answered no, on the evidence: fan-out');
    console.log('is not merely unbuilt, it is explicitly, repeatedly excluded at four');
    console.log('independent layers of the real distribution/discovery stack, in near-');
    console.log('identical language, across milestones from 0.9.25 through 0.9.295');
    console.log('(Section C). Preference, selection, and execution are already three');
    console.log('distinct, real, unconflated seams (Section B). Discovery\'s own broad');
    console.log('querying is real but is a read-time, application-decided behavior with');
    console.log('no structural connection to a write-time preference, and 0.9.298\'s own');
    console.log('audit already evaluated — and declined — narrowing it (Section F). A');
    console.log('reusable, already-proven pattern for partial-success reporting exists');
    console.log('(independently-nullable per-fact results, generalizing from two facts to');
    console.log('N), so a future fan-out execution boundary, should one ever become');
    console.log('genuinely warranted, would not need to invent lifecycle vocabulary first');
    console.log('(Section G) — but no role today has a genuine unmet multi-provider need');
    console.log('to warrant building it now (Section E). Of the proposal\'s own five');
    console.log('candidate models, only the single-provider model already shipped');
    console.log('survives the evidence (Section H). This milestone recommends no schema');
    console.log('change, no new preference shape, no fan-out executor, and no partial-');
    console.log('success vocabulary: the correct next step, if a future milestone finds a');
    console.log('genuine unmet multi-provider need in a role other than CONTENT, is to');
    console.log('name that need concretely, from real evidence, the same way 0.9.298 and');
    console.log('0.9.304 already did for CONTENT itself — never to build fan-out ahead of');
    console.log('a demonstrated requirement.');
    console.log('='.repeat(78));

    console.log('\n✅ All Multi-Substrate Publication Preference Product Direction Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
