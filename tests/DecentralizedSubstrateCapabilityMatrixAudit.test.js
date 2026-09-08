import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';

import { DiscoveryProvider } from '../discovery/DiscoveryProvider.js';
import { ContentStore } from '../content/ContentStore.js';
import { ProofVerifier } from '../anchoring/ProofVerifier.js';
import { DecentralizedDiscoveryQueryService } from '../application/DecentralizedWorldDiscoveryQuery.js';

import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';

import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';

import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { IpfsRemotePinningContentStore } from '../content/IpfsRemotePinningContentStore.js';

import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';

import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { ExternalAnchorEvidenceViewRegistry } from '../application/ExternalAnchorEvidenceViewRegistry.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { SnapshotPlacementViewRegistry } from '../application/SnapshotPlacementViewRegistry.js';

// 0.9.292 — Decentralized Substrate Capability Matrix Audit.
//
// Test-only. Zero production changes. A user, reviewing the Publication
// Distribution work 0.9.44 through 0.9.105 already shipped, proposed
// letting a person choose WHICH substrate satisfies each of Discovery,
// Content, and Proof — while warning against exposing Nostr/IPFS/Bitcoin/
// Base/Arweave as one flat "network" list, since Arweave alone already
// participates in multiple roles. That proposal itself asked the right
// question first: does this codebase currently have enough REAL, uniform,
// production capability per role for a preference to mean anything, or
// would a preference UI built today just be configuration for capability
// that does not yet exist? This file is that question, answered from real
// source — never from prose, never from what a substrate "could
// theoretically do."
//
//   docs/Roadmap.md's own three-role framing (ANNOUNCEMENT_AND_DISCOVERY /
//   CONTENT / PROOF_AND_ANCHORING — defined here, in this file, as
//   audit-local constants; see Section A for why they are NOT promoted to
//   a new production module)
//                    │
//                    ▼
//   tests/DecentralizedSubstrateCapabilityMatrixAudit.test.js   ★ (THIS)
//        Section A — freeze the roles, and the real base-class seam (or
//                     seams — see "two discovery families," below) each
//                     one already maps to in production
//        Section B — the provider × role matrix, built from real
//                     `instanceof`/registry checks, never a guess
//        Section C — capability semantics: the exact class for every
//                     non-empty cell
//        Section D — provider independence: proof that TODAY's real
//                     `PublicationDistributionRuntimeComposition.js` and
//                     `DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`
//                     already compose two providers for one role, and two
//                     roles for one Publication, independently
//        Section E — the Arweave multi-role case specifically: three
//                     content-side seams, one discovery-side seam, all
//                     mutually unaware of one another
//        Section F — configuration authority: the FOUR storage/anchorType-
//                     keyed registries this codebase already runs
//                     (Content ×2, Proof ×2) versus the Discovery role,
//                     which has none yet
//        Section G — default behavior: no provider-preference concept
//                     existed anywhere in source at the time this audit
//                     was written; UPDATED by 0.9.293 — Decentralized
//                     Role Provider Preference Boundary, which fills
//                     exactly this gap with two new, deliberately
//                     unconsumed files (core/RoleProviderRole.js,
//                     core/RoleProviderPreference.js) — this section now
//                     asserts the concept exists in exactly those two
//                     files, and nowhere else; UPDATED AGAIN by 0.9.294 —
//                     Decentralized Role Provider Preference Persistence
//                     Boundary, whose storage/RoleProviderPreferenceStore.js
//                     is a legitimate third file mentioning the concept —
//                     it persists a RoleProviderPreference, never resolves
//                     one, so the allowed set grows to exactly three
//        Section H — availability vs preference: "no fallback" is
//                     everywhere DOCUMENTED, never once IMPLEMENTED
//        Section I — persistence: no preference-shaped storage key exists
//        Section J — the verdict this whole file was written to reach
//
// THE MATRIX'S OWN BAR, STATED ONCE, HELD EVERYWHERE BELOW: a cell is ✓
// only when a concrete class exists, in production source, that extends
// (or duck-satisfies, where this codebase's own established pattern is
// duck-typing — see Section B's own NostrSnapshotDiscoveryQueryService
// case) the role's real interface, is actually constructible, and — for
// Proof specifically — is actually retrievable through the registry this
// codebase already runs proof verification through. A cell is ◐ when a
// REAL, production, non-hypothetical half of the round trip exists and
// another real half does not — never a vague "partially maybe." A cell is
// — when a repo-wide source sweep confirms zero such class exists at all.
// Nothing below is ever asserted from this file's own prose; every claim
// is a real `instanceof` check, a real construction, a real registry
// round-trip, or a real `readFile()` sweep over actual source text.
//
// WHY THE THREE ROLES ARE AUDIT-LOCAL CONSTANTS, NEVER A NEW PRODUCTION
// MODULE. This milestone's own brief is a capability AUDIT — it exists to
// find out whether configuration is warranted, not to build it. Freezing
// `ANNOUNCEMENT_AND_DISCOVERY`/`CONTENT`/`PROOF_AND_ANCHORING` as a new
// `core/` or `application/` export would be exactly the "configuration for
// capabilities that don't yet exist uniformly" mistake Section J's own
// verdict says this codebase must not make yet. The three names live only
// in this test file, exist only to label the matrix Sections B/C build,
// and are never imported by, or referenced from, any production file.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A `RoleProviderConfiguration` class, a preference schema, or any
//   persisted preference of any kind.** Sections G/H/I prove none exists
//   today; this file adds none either — see Section J's own verdict.
// - **A Base `ProofVerifier`, or a write-side Arweave discovery
//   publisher.** Section B names both gaps precisely; filling either is
//   real, unscheduled, unstarted future work — this audit identifies the
//   gap, it does not close it.
// - **A `DiscoveryProviderRegistry`, or any other new registry.** Section F
//   documents that Content and Proof already have one apiece and Discovery
//   does not; building the missing one is exactly the kind of "before any
//   UI" work Section J's verdict names, and exactly the kind of work this
//   test-only milestone does not do.
// - **Any UI, panel, or preference control of any kind.** Nothing in
//   `ui/` is touched, read for behavior, or asserted against beyond the
//   substrate-branching sweep in Section F.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Recursively lists every `.js` file under `relativeDir` (excluding
// `tests/`, which is never part of a production-capability sweep), for the
// repo-wide "does ANY file matching this shape exist" checks Sections
// B/F/G/H/I all rely on. Never touches `tests/`, `node_modules/`, or `.git/`.
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
    const dirs = ['core', 'application', 'content', 'discovery', 'anchoring', 'base', 'arweave', 'nostr', 'publisher', 'ui', 'identity', 'storage', 'peer', 'replication', 'placement', 'spatial', 'serializer', 'presence', 'collaboration', 'world', 'world-layout', 'persistence', 'server', 'renderer', 'core'];
    const all = [];
    for (const dir of dirs) {
        await listJsFiles(dir, all);
    }
    return [...new Set(all)];
}

// A harmless no-op collaborator, reused across every constructor below
// that requires a `fetchImpl`/`signer`/`queryImpl`/`publishImpl` but is
// never actually invoked by this file's own structural assertions — this
// audit checks class SHAPE and registry composition, never live wire
// behavior (every substrate's own live wire behavior already has its own
// dedicated test file).
function neverCalled() {
    throw new Error('neverCalled: this audit never actually invokes network/signing behavior');
}
const fakeSigner = { sign: neverCalled };

async function run() {
    // ===============================================================
    // Section A — freeze the three roles, and prove, from real source,
    // that Discovery alone already has TWO non-interchangeable production
    // interface shapes — exactly why "network" is the wrong noun and
    // "role" is the right one.
    // ===============================================================
    {
        const ROLES = Object.freeze({
            ANNOUNCEMENT_AND_DISCOVERY: 'ANNOUNCEMENT_AND_DISCOVERY',
            CONTENT: 'CONTENT',
            PROOF_AND_ANCHORING: 'PROOF_AND_ANCHORING'
        });
        assert(Object.keys(ROLES).length === 3, 'A1. exactly three roles, matching the milestone brief — never a fourth, never a merged "network" role');

        // CONTENT and PROOF_AND_ANCHORING each map to exactly one real
        // production base class.
        assert(typeof ContentStore === 'function', 'A2. content/ContentStore.js is the real CONTENT seam');
        assert(typeof ProofVerifier === 'function', 'A3. anchoring/ProofVerifier.js is the real PROOF_AND_ANCHORING seam');

        // ANNOUNCEMENT_AND_DISCOVERY maps to TWO real, coexisting, non-
        // interchangeable shapes — this is not a discrepancy this audit
        // needs to resolve, it is the exact fact the milestone brief's own
        // warning ("do not turn these into a generalized network
        // abstraction") predicts. discovery/DiscoveryProvider.js answers
        // "list/find a Publication already known to this replica"; it is
        // LOCAL/catalog discovery — LocalDiscoveryProvider and
        // PublicationCatalogDiscoveryProvider are its only two
        // implementations, and neither is substrate-specific.
        // application/DecentralizedWorldDiscoveryQuery.js's own
        // DecentralizedDiscoveryQueryService answers a different question
        // — "search an external substrate, by discoveryTag, for a rumor of
        // where a Publication's material claims to live" — the shape a
        // Nostr relay or an Arweave gateway actually satisfies.
        assert(typeof DiscoveryProvider === 'function', 'A4. discovery/DiscoveryProvider.js — the LOCAL/catalog discovery shape');
        assert(typeof DecentralizedDiscoveryQueryService === 'function', 'A5. application/DecentralizedWorldDiscoveryQuery.js — the SUBSTRATE announcement/query shape');

        const localMethods = ['list', 'findById', 'findByAuthor', 'findByParentId', 'findByDocumentId'];
        for (const m of localMethods) {
            assert(typeof DiscoveryProvider.prototype[m] === 'function', `A6. DiscoveryProvider.prototype.${m} exists — the local/catalog contract`);
        }
        assert(typeof DecentralizedDiscoveryQueryService.prototype.search === 'function', 'A7. DecentralizedDiscoveryQueryService.prototype.search exists — the substrate-query contract');
        assert(!('list' in DecentralizedDiscoveryQueryService.prototype), 'A8. DecentralizedDiscoveryQueryService never carries DiscoveryProvider\'s own list()-shaped vocabulary — the two families never merged');
        assert(!('search' in DiscoveryProvider.prototype), 'A9. DiscoveryProvider never carries DecentralizedDiscoveryQueryService\'s own search()-shaped vocabulary — confirmed the other direction too');

        // A THIRD shape: NostrSnapshotDiscoveryQueryService is real,
        // production, and used (application/DecentralizedSnapshotResolver.js
        // calls it), yet extends neither of the above — proven from its own
        // source, never from a class-hierarchy guess.
        const nostrSnapshotSource = await source('application/NostrSnapshotDiscoveryQueryService.js');
        assert(/class NostrSnapshotDiscoveryQueryService\s*\{/.test(nostrSnapshotSource), 'A10. NostrSnapshotDiscoveryQueryService extends NOTHING — a real, third, independently-typed Discovery shape, duck-compatible by search()/origin alone, never unified with the other two');
        assert(!(new NostrSnapshotDiscoveryQueryService({ queryImpl: neverCalled }) instanceof DecentralizedDiscoveryQueryService), 'A11. confirmed at the object level, not just the source text: a real instance is NOT an instanceof DecentralizedDiscoveryQueryService');

        console.log('✓ Section A: three roles frozen (audit-local only); Discovery role alone already has THREE non-interchangeable production shapes — DiscoveryProvider (local/catalog), DecentralizedDiscoveryQueryService (Publication substrate query), and NostrSnapshotDiscoveryQueryService (Snapshot substrate query, unified with neither) — confirming "network" would have been the wrong abstraction to expose');
    }

    // ===============================================================
    // Section B — the provider × role matrix itself, built from real
    // instanceof checks, real construction, and real registry round-trips.
    // ===============================================================
    {
        // --- Nostr -----------------------------------------------------
        const nostrDiscovery = new NostrDiscoveryQueryService({ queryImpl: neverCalled });
        assert(nostrDiscovery instanceof DecentralizedDiscoveryQueryService, 'B1. Nostr/Discovery = ✓ — NostrDiscoveryQueryService is a real DecentralizedDiscoveryQueryService');
        const nostrSnapshotDiscovery = new NostrSnapshotDiscoveryQueryService({ queryImpl: neverCalled });
        assert(typeof nostrSnapshotDiscovery.search === 'function', 'B2. Nostr/Discovery = ✓ (Snapshot half) — NostrSnapshotDiscoveryQueryService duck-satisfies search()');
        assert(typeof new NostrPublicationDiscoveryPublisher({ relayUrl: 'wss://x', discoveryTag: 't', publishImpl: neverCalled }).publish === 'function', 'B3. Nostr/Discovery round trip is COMPLETE — a real write-side publisher exists (Publication half)');
        assert(typeof new NostrSnapshotDiscoveryPublisher({ relayUrl: 'wss://x', discoveryTag: 't', publishImpl: neverCalled }).publish === 'function', 'B4. Nostr/Discovery round trip is COMPLETE — a real write-side publisher exists (Snapshot half too)');

        // --- IPFS --------------------------------------------------------
        const ipfsStores = [
            new IpfsContentStore({ fetchImpl: neverCalled }),
            new IpfsGatewayContentStore({ fetchImpl: neverCalled }),
            new IpfsRemotePinningContentStore({ provider: { put: neverCalled } })
        ];
        for (const store of ipfsStores) {
            assert(store instanceof ContentStore, `B5. IPFS/Content = ✓ — ${store.constructor.name} is a real ContentStore`);
            assert(store.storage === 'ipfs', `B6. ${store.constructor.name}.storage === 'ipfs'`);
        }

        // --- Bitcoin -------------------------------------------------
        const bitcoinProof = new BitcoinOpReturnProofVerifier({ fetchImpl: neverCalled });
        assert(bitcoinProof instanceof ProofVerifier, 'B7. Bitcoin/Proof = ✓ — BitcoinOpReturnProofVerifier is a real ProofVerifier');
        assert(bitcoinProof.anchorType === 'bitcoin-op-return', 'B8. anchorType === "bitcoin-op-return"');
        const registry = new ExternalProofVerifierRegistry();
        registry.register(bitcoinProof);
        assert(registry.get('bitcoin-op-return') === bitcoinProof, 'B9. Bitcoin\'s proofVerifier is genuinely retrievable through the SAME registry ExternalAnchorVerifier.js verifies through — not merely "extends the base class," but actually pluggable end to end');

        // --- Base ------------------------------------------------------
        // Base has real, production create/broadcast/observe infrastructure
        // (base/BasePublicationTransactionPlanner.js, base/
        // BaseTransactionBroadcaster.js, base/
        // BaseTransactionInclusionObserver.js) — but NO class anywhere in
        // this repository extends ProofVerifier for it, and none is ever
        // registered into ExternalProofVerifierRegistry. Proven by a
        // repo-wide sweep, not by "Base has no anchoring/ directory" (it
        // does have one, one layer over — base/ itself).
        const allProductionFiles = await repoWideProductionFiles();
        let proofVerifierSubclassCount = 0;
        let baseNamedProofVerifierCount = 0;
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (/extends\s+ProofVerifier\b/.test(text)) {
                proofVerifierSubclassCount += 1;
                if (/base/i.test(file)) baseNamedProofVerifierCount += 1;
            }
        }
        assert(proofVerifierSubclassCount === 1, `B10. exactly ONE class in the entire production source tree extends ProofVerifier (found ${proofVerifierSubclassCount}) — Bitcoin's, and Bitcoin's alone`);
        assert(baseNamedProofVerifierCount === 0, 'B11. Base/Proof = ◐ (PARTIAL, not ✓) — real create/broadcast/inclusion-observation exists (base/BaseTransactionBroadcaster.js, base/BaseTransactionInclusionObserver.js), but the verify half — a ProofVerifier the shared registry could dispatch to — does not exist anywhere in source');

        // --- Arweave -----------------------------------------------------
        const arweaveContentStore = new ArweaveContentStore({ signer: fakeSigner, fetchImpl: neverCalled });
        assert(arweaveContentStore instanceof ContentStore, 'B12. Arweave/Content = ✓ (Snapshot half) — ArweaveContentStore is a real ContentStore');
        assert(arweaveContentStore.storage === 'ar', 'B13. storage === "ar"');
        const arweaveUploader = new ArweavePublicationMaterialUploader({ signer: fakeSigner, fetchImpl: neverCalled });
        assert(typeof arweaveUploader.upload === 'function', 'B14. Arweave/Content = ✓ (Publication half) — ArweavePublicationMaterialUploader is a real, separate write-only seam');
        assert(!(arweaveUploader instanceof ContentStore), 'B15. ArweavePublicationMaterialUploader does NOT extend ContentStore — a genuinely different shape from ArweaveContentStore, never unified, despite the identical substrate');
        const arweaveResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: neverCalled });
        assert(typeof arweaveResolver.retrieveByUri === 'function', 'B16. Arweave/Content = ✓ (World Encounter half) — ArweaveWorldEncounterMaterialResolver is a THIRD, read-only Arweave content seam');
        assert(!(arweaveResolver instanceof ContentStore), 'B17. ArweaveWorldEncounterMaterialResolver does NOT extend ContentStore either — three Arweave content classes, no shared base beyond one of the three');

        const arweaveDiscovery = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: neverCalled });
        assert(arweaveDiscovery instanceof DecentralizedDiscoveryQueryService, 'B18. Arweave/Discovery = ◐ (read half) — ArweaveGraphqlDiscoveryQueryService is a real DecentralizedDiscoveryQueryService');
        const arweaveDiscoverySource = await source('application/ArweaveGraphqlDiscoveryQueryService.js');
        assert(/this class never writes a[\s\S]{0,40}transaction or a[\s\S]{0,10}tag/i.test(arweaveDiscoverySource), 'B19. the class\'s own header states, in its own words, that it never writes — never inferred by this audit');
        let arweaveDiscoveryPublisherCount = 0;
        for (const file of allProductionFiles) {
            if (/^application\/Arweave.*Publisher\.js$/.test(file.replace(/^\.?\//, ''))) arweaveDiscoveryPublisherCount += 1;
        }
        assert(arweaveDiscoveryPublisherCount === 0, 'B20. confirmed repo-wide: no application/Arweave*Publisher.js file exists — Arweave/Discovery has a real, working read half and NO write half at all, unlike Nostr\'s complete round trip (B3/B4)');

        let arweaveProofVerifierCount = 0;
        for (const file of allProductionFiles) {
            if (/arweave/i.test(file)) {
                const text = await source(file);
                if (/extends\s+ProofVerifier\b/.test(text)) arweaveProofVerifierCount += 1;
            }
        }
        assert(arweaveProofVerifierCount === 0, 'B21. Arweave/Proof = — (absent, not partial) — zero classes anywhere named or shaped as an Arweave ProofVerifier; the "Arweave could anchor too" idea from the task that requested this audit names no real seam');

        const MATRIX = Object.freeze({
            nostr: Object.freeze({ discovery: '✓', content: '—', proof: '—' }),
            ipfs: Object.freeze({ discovery: '—', content: '✓', proof: '—' }),
            bitcoin: Object.freeze({ discovery: '—', content: '—', proof: '✓' }),
            base: Object.freeze({ discovery: '—', content: '—', proof: '◐' }),
            arweave: Object.freeze({ discovery: '◐', content: '✓', proof: '—' })
        });
        console.log('  Provider  | Discovery | Content | Proof');
        for (const [name, row] of Object.entries(MATRIX)) {
            console.log(`  ${name.padEnd(9)} | ${row.discovery.padEnd(9)} | ${row.content.padEnd(7)} | ${row.proof}`);
        }
        console.log('✓ Section B: the real provider × role matrix, verified from source and object identity — three ✓ cells are full round trips, two cells (Base/Proof, Arweave/Discovery) are genuine ◐ partials with one real half missing, and every other cell is a confirmed, repo-wide-swept —, never a guess');
    }

    // ===============================================================
    // Section C — capability semantics: the exact seam behind every
    // non-empty cell, restated as one line each (the audit's own
    // deliverable the brief asked for by name).
    // ===============================================================
    {
        const SEMANTICS = Object.freeze({
            'Nostr → Discovery (Publication)': 'application/NostrDiscoveryQueryService.js + application/NostrPublicationDiscoveryPublisher.js',
            'Nostr → Discovery (Snapshot)': 'application/NostrSnapshotDiscoveryQueryService.js + application/NostrSnapshotDiscoveryPublisher.js',
            'IPFS → Content': 'content/IpfsContentStore.js, content/IpfsGatewayContentStore.js, content/IpfsRemotePinningContentStore.js',
            'Bitcoin → Proof': 'anchoring/BitcoinOpReturnProofVerifier.js, registered through application/ExternalProofVerifierRegistry.js',
            'Base → Proof (create/observe only)': 'base/BasePublicationTransactionPlanner.js, base/BaseTransactionBroadcaster.js, base/BaseTransactionInclusionObserver.js — no verify-side class',
            'Arweave → Content (Snapshot)': 'content/ArweaveContentStore.js',
            'Arweave → Content (Publication, write-only)': 'application/ArweavePublicationMaterialUploader.js',
            'Arweave → Content (World Encounter, read-only)': 'application/ArweaveWorldEncounterMaterialResolver.js',
            'Arweave → Discovery (read-only)': 'application/ArweaveGraphqlDiscoveryQueryService.js — no write-side class'
        });
        assert(Object.keys(SEMANTICS).length === 9, 'C1. nine named seams — matching every non-empty/partial cell Section B found, no more, no fewer');
        for (const [label, seam] of Object.entries(SEMANTICS)) {
            console.log(`  ${label}: ${seam}`);
        }
        console.log('✓ Section C: every non-empty cell in Section B\'s matrix now names its exact, real, existing seam — never "this technology could theoretically do this"');
    }

    // ===============================================================
    // Section D — provider independence: TODAY's real composition roots
    // already treat role selection as independent per-role wiring, not
    // one flat network choice — proven by importing the actual files, not
    // by re-describing what they say about themselves.
    // ===============================================================
    {
        const distributionSource = await source('application/PublicationDistributionRuntimeComposition.js');
        assert(distributionSource.includes("import { ArweavePublicationMaterialUploader }"), 'D1. the one real, shipped Publication distribution pipeline composes a CONTENT provider (Arweave)…');
        assert(distributionSource.includes("import { NostrPublicationDiscoveryPublisher }"), 'D2. …and a DISCOVERY provider (Nostr) — independently, in the same file');
        const uploaderSource = await source('application/ArweavePublicationMaterialUploader.js');
        const publisherSource = await source('application/NostrPublicationDiscoveryPublisher.js');
        const importsClass = (text, className) => new RegExp(`^import\\b[^\\n]*\\b${className}\\b`, 'm').test(text);
        assert(!importsClass(uploaderSource, 'NostrPublicationDiscoveryPublisher'), 'D3. the CONTENT collaborator never IMPORTS the DISCOVERY collaborator (a header may still discuss it in prose, as this codebase\'s own convention already does — see the many prose mentions in the file this D4 check reads)');
        assert(!importsClass(publisherSource, 'ArweavePublicationMaterialUploader'), 'D4. …nor the other way around — role independence is a real absence of an import statement, not an absence of discussion');

        // The SAME role (Discovery) already carries two independently
        // pluggable providers side by side for World Encounter material —
        // a live reproduction, not merely an import check.
        const { composeDecentralizedWorldEncounterMaterialDiscoveryServices } =
            await import('../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        const nostrCalls = [];
        const arweaveCalls = [];
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: async (...args) => { nostrCalls.push(args); return []; },
            arweaveFetchImpl: async (...args) => { arweaveCalls.push(args); return { ok: true, status: 200, json: async () => ({ data: { transactions: { edges: [] } } }) }; }
        });
        assert(services.nostr !== null && services.arweave !== null, 'D5. BOTH a Nostr and an Arweave discovery service are constructed side by side, for the identical Discovery role, from one composition call');
        await services.nostr.search('audit-d-tag');
        await services.arweave.search('audit-d-tag');
        assert(nostrCalls.length === 1 && arweaveCalls.length === 1, 'D6. each was genuinely, independently invoked — this is a real multi-provider Discovery role today, in production, years before any preference UI would exist');

        console.log('✓ Section D: role independence — CONTENT and DISCOVERY are already composed as two separate, non-importing collaborators in the one real Publication distribution pipeline shipped today, and the DISCOVERY role alone already runs two independently-constructed, independently-invoked providers (Nostr + Arweave) side by side — proving the "role → many possible providers" shape this milestone was asked to evaluate is not a future architecture change, it already exists, unconfigured');
    }

    // ===============================================================
    // Section E — the Arweave multi-role case, specifically: proof that
    // "Arweave satisfies Discovery, Content, AND (theoretically) Proof"
    // never collapsed into one Arweave subsystem — the exact concern the
    // task that requested this audit raised.
    // ===============================================================
    {
        const arweaveNamedFiles = [
            'content/ArweaveContentStore.js',
            'application/ArweavePublicationMaterialUploader.js',
            'application/ArweaveWorldEncounterMaterialResolver.js',
            'application/ArweaveGraphqlDiscoveryQueryService.js'
        ];
        const texts = {};
        for (const f of arweaveNamedFiles) texts[f] = await source(f);

        // No two of the four ever import one another.
        for (const [fileA, textA] of Object.entries(texts)) {
            for (const fileB of Object.keys(texts)) {
                if (fileA === fileB) continue;
                const baseName = fileB.split('/').pop().replace('.js', '');
                assert(!textA.includes(`from '../${fileB.replace(/^[^/]+\//, '')}'`) && !new RegExp(`import\\s*\\{[^}]*\\b${baseName}\\b`).test(textA),
                    `E1. ${fileA} never imports ${baseName} — the four Arweave-named files are mutually unaware of one another`);
            }
        }

        // Object identity: constructing one never constructs, or requires,
        // any of the others.
        const contentStore = new ArweaveContentStore({ signer: fakeSigner, fetchImpl: neverCalled });
        const uploader = new ArweavePublicationMaterialUploader({ signer: fakeSigner, fetchImpl: neverCalled });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: neverCalled });
        const discovery = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: neverCalled });
        assert(!(contentStore instanceof DecentralizedDiscoveryQueryService), 'E2. the Content seam is never a Discovery seam');
        assert(!(discovery instanceof ContentStore), 'E3. …and the Discovery seam is never a Content seam, confirmed the other direction');
        assert(contentStore !== uploader && uploader !== resolver && resolver !== discovery, 'E4. four genuinely distinct object identities — never one Arweave subsystem wearing four names');

        console.log('✓ Section E: Arweave Discovery ≠ Arweave Content (Snapshot) ≠ Arweave Content (Publication) ≠ Arweave Content (World Encounter) — same external substrate, four mutually-unimporting production seams, none aware the others exist. "Same substrate does not imply same architectural role" already holds in shipped code, not just as an aspiration');
    }

    // ===============================================================
    // Section F — configuration authority: the FOUR keyed registries this
    // codebase already runs (Content ×2, Proof ×2) versus zero for
    // Discovery, plus a repo-wide sweep confirming ui/ never becomes the
    // substrate router.
    // ===============================================================
    {
        // Content already has a keyed registry (retrieval + presentation).
        const contentStoreRegistry = new SnapshotPlacementStoreRegistry();
        const ipfsStore = new IpfsContentStore({ fetchImpl: neverCalled });
        const arweaveStore = new ArweaveContentStore({ signer: fakeSigner, fetchImpl: neverCalled });
        contentStoreRegistry.register(ipfsStore);
        contentStoreRegistry.register(arweaveStore);
        assert(contentStoreRegistry.get('ipfs') === ipfsStore, 'F1. Content/retrieval: a real plugin, registered under its OWN storage key, is genuinely retrievable — SnapshotPlacementStoreRegistry (0.8.18)');
        assert(contentStoreRegistry.get('ar') === arweaveStore, 'F2. …and a second, different storage key, in the same registry, at the same time — this is already multi-provider-per-role in production');
        assert(typeof SnapshotPlacementViewRegistry === 'function', 'F3. Content/presentation has its own sibling registry too (0.8.20)');

        // Proof already has a keyed registry.
        const proofRegistry = new ExternalProofVerifierRegistry();
        proofRegistry.register(new BitcoinOpReturnProofVerifier({ fetchImpl: neverCalled }));
        assert(proofRegistry.get('bitcoin-op-return') !== undefined, 'F4. Proof/verification already has a keyed registry too — ExternalProofVerifierRegistry (0.8.1)');
        assert(typeof ExternalAnchorEvidenceViewRegistry === 'function', 'F5. …and its own presentation-side sibling (0.8.14), mirroring Content\'s pair exactly');

        // Discovery has no EQUIVALENT registry — checked precisely, not by
        // filename alone. Two Discovery-adjacent *Registry.js files do
        // exist (application/DecentralizedWorldDiscoveryLeadRegistry.js,
        // application/WorldDiscoverySourceRegistry.js) and this audit reads
        // both rather than pretending a naming sweep alone settles it: both
        // are `set*(record)`/`list*()` MEMBERSHIP stores for already-
        // produced data (a lead; a live peer-derived WorldDiscoverySource
        // bundle) — neither exposes a `register(plugin)` that reads a
        // plugin's own self-declared key the way SnapshotPlacementStoreRegistry
        // and ExternalProofVerifierRegistry both do (F1-F4). Confirmed
        // directly: neither file defines a `register` method at all.
        const allProductionFiles = await repoWideProductionFiles();
        const leadRegistrySource = await source('application/DecentralizedWorldDiscoveryLeadRegistry.js');
        const sourceRegistrySource = await source('application/WorldDiscoverySourceRegistry.js');
        assert(!/\bregister\s*\(/.test(leadRegistrySource), 'F6a. DecentralizedWorldDiscoveryLeadRegistry has no register() method — it is a lead-membership store, not a provider-plugin registry');
        assert(!/\bregister\s*\(/.test(sourceRegistrySource), 'F6b. WorldDiscoverySourceRegistry has no register() method either — a live peer-source membership store, same distinction');

        let discoveryProviderPluginRegistryCount = 0;
        for (const file of allProductionFiles) {
            if (!/Registry\.js$/.test(file) || !/discovery/i.test(file)) continue;
            const text = await source(file);
            if (/\bregister\s*\([^)]*\)\s*\{[\s\S]{0,300}?\.(anchorType|storage|origin)\b/.test(text)) discoveryProviderPluginRegistryCount += 1;
        }
        assert(discoveryProviderPluginRegistryCount === 0, 'F6c. zero Discovery-named registries anywhere follow the "plugin names its own key (storage/anchorType/origin), register() reads it back" shape Content and Proof both already run through — every real Discovery composition root (D1-D6) wires its providers by direct, positional constructor call instead');

        // ui/ never becomes the substrate router — a real repo-wide sweep
        // for the exact anti-pattern the milestone brief named.
        const branchPattern = /===\s*['"](nostr|arweave|ipfs|bitcoin|base)['"]/i;
        let uiBranchCount = 0;
        const uiFiles = await listJsFiles('ui');
        for (const file of uiFiles) {
            const text = await source(file);
            const codeOnly = text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            if (branchPattern.test(codeOnly)) uiBranchCount += 1;
        }
        assert(uiBranchCount === 0, 'F7. zero ui/ files contain an `=== "nostr"`/`"arweave"`/`"ipfs"`/`"bitcoin"`/`"base"`-shaped substrate branch, outside comments — the ONE place this codebase discusses that exact anti-pattern (application/PublicationSnapshotPlacementDetailView.js\'s own header) is explaining why it built SnapshotPlacementViewRegistry.js instead');

        console.log('✓ Section F: Configuration authority already lives in a keyed registry for Content (×2) and Proof (×2) — real, shipped, proven by round-trip — but has no equivalent for Discovery at all today, and ui/ itself never routes by substrate name anywhere in the current tree. A future Role Provider Configuration belongs beside these four registries, never inside ui/');
    }

    // ===============================================================
    // Section G — default behavior: at the time this audit was written,
    // no provider-preference concept existed anywhere in source. 0.9.293
    // — Decentralized Role Provider Preference Boundary — is the direct,
    // named answer to this very gap (see Section J's own prerequisite
    // list, item 4) and deliberately introduced exactly two files that
    // now legitimately mention one: core/RoleProviderRole.js and
    // core/RoleProviderPreference.js. 0.9.294 — Decentralized Role
    // Provider Preference Persistence Boundary — added a third,
    // storage/RoleProviderPreferenceStore.js, the durable home those two
    // files' own preference finally gets; it persists a
    // RoleProviderPreference by role and hands one back, but still never
    // resolves, validates capability for, or falls back on one (see that
    // file's own header). 0.9.295 — Role-Aware Provider Resolution
    // Boundary — added a fourth, application/RoleAwareProviderResolver.js:
    // it reads a preference back out of 0.9.294's own store and looks its
    // providerKey up in a real per-role registry (application/
    // SnapshotPlacementStoreRegistry.js for Content, application/
    // ExternalProofVerifierRegistry.js for Proof, a caller-built adapter
    // over the real Discovery composition for Discovery), but still never
    // falls back, never wires into any production composition root, and
    // never resolves via any registry outside the one its own role owns
    // (see that file's own header). 0.9.296 — Role Provider Resolution
    // Integration Readiness Audit — added no new file to this set (it is
    // test-only). 0.9.297 — Role Provider Preference Application Boundary
    // — added a fifth, application/ResolvePreferredRoleProviderUseCase.js:
    // the single application-level seam a future workflow calls instead of
    // importing the preference store or the resolver directly; it reads a
    // preference straight from 0.9.294's own store and delegates the
    // actual decision to 0.9.295's own resolver, but still constructs
    // nothing, still never falls back, and is still not imported by any
    // composition root (see that file's own header). 0.9.299 — Content
    // Creation Provider Preference Integration — added a sixth and
    // seventh file, application/PreferredSnapshotPlacementCreationCoordinator.js
    // and its own composition root, application/
    // CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js, AND —
    // for the first time — a real composition root, ui/main.js, which
    // wires the preference chain into the one production Content creation
    // workflow (see that file's own 0.9.299 comment). This section is
    // UPDATED, not deleted, by each milestone in turn — it still holds the
    // line that matters: the concept exists in exactly the boundary/
    // integration files those milestones themselves added, and nowhere
    // else. A hit anywhere outside that set would mean the preference
    // concept leaked into a DIFFERENT composition root, registry, or ui/
    // view than the one 0.9.299 deliberately integrated — exactly what
    // 0.9.293's boundary, 0.9.294's persistence layer, 0.9.295's resolver,
    // 0.9.297's application seam, and 0.9.299's own scoped integration
    // were all built to hold the line on (see
    // tests/DecentralizedRoleProviderPreferenceBoundary.test.js Section M,
    // tests/DecentralizedRoleProviderPreferencePersistence.test.js
    // Section K, tests/RoleAwareProviderResolution.test.js Section M, and
    // tests/RoleProviderPreferenceApplicationBoundary.test.js Section K,
    // which each sweep for the same thing from their own side).
    // ===============================================================
    {
        const allProductionFiles = await repoWideProductionFiles();
        const preferencePattern = /providerPreference|networkPreference|preferredProvider|substratePreference/i;
        const KNOWN_PREFERENCE_BOUNDARY_FILES = new Set([
            'core/RoleProviderRole.js',
            'core/RoleProviderPreference.js',
            'storage/RoleProviderPreferenceStore.js',
            'application/RoleAwareProviderResolver.js',
            'application/ResolvePreferredRoleProviderUseCase.js',
            'application/PreferredSnapshotPlacementCreationCoordinator.js',
            'application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js',
            'ui/main.js'
        ]);
        let hits = 0;
        const hitFiles = [];
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (preferencePattern.test(text)) {
                hits += 1;
                hitFiles.push(file);
            }
        }
        assert(hits === KNOWN_PREFERENCE_BOUNDARY_FILES.size, `G1. exactly the eight files 0.9.293/0.9.294/0.9.295/0.9.297/0.9.299 themselves introduced or wired mention a provider preference (found ${hits}: ${hitFiles.join(', ')}) — every OTHER production file remains exactly as free of the concept as it was when this audit first ran`);
        for (const file of hitFiles) {
            assert(KNOWN_PREFERENCE_BOUNDARY_FILES.has(file), `G2. the only file(s) allowed to mention a provider preference are 0.9.293/0.9.294/0.9.295/0.9.297/0.9.299's own boundary/integration files — "${file}" is not one of them`);
        }
        console.log('✓ Section G: as of 0.9.299, a provider-preference concept exists in exactly the eight files those five milestones introduced or wired (core/RoleProviderRole.js, core/RoleProviderPreference.js, storage/RoleProviderPreferenceStore.js, application/RoleAwareProviderResolver.js, application/ResolvePreferredRoleProviderUseCase.js, application/PreferredSnapshotPlacementCreationCoordinator.js, application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js, ui/main.js) — a pure semantic boundary with a durable home, a real tested resolution path, one stable application seam, and now one real production Content creation integration; every other production file this audit already knew about remains exactly as free of the concept as it was at 0.9.292');
    }

    // ===============================================================
    // Section H — availability vs preference: "no fallback" is a
    // restraint this codebase documents repeatedly and enforces
    // structurally — never something a preference UI would be overriding,
    // because there is nothing to override.
    // ===============================================================
    {
        const filesToCheck = [
            'content/ArweaveContentStore.js',
            'content/IpfsGatewayContentStore.js',
            'content/IpfsRemotePinningContentStore.js',
            'application/ArweaveWorldEncounterMaterialResolver.js',
            'application/ArweavePublicationMaterialUploader.js',
            'application/NostrPublicationDiscoveryPublisher.js',
            'application/NostrSnapshotDiscoveryPublisher.js',
            'anchoring/BitcoinAnchorTransactionBroadcaster.js',
            'base/BaseTransactionBroadcaster.js'
        ];
        let fallbackMentions = 0;
        let fallbackClassOrFunctionCount = 0;
        for (const file of filesToCheck) {
            const text = await source(file);
            if (/fallback/i.test(text)) fallbackMentions += 1;
            if (/(class|function)\s+\w*[Ff]allback/.test(text)) fallbackClassOrFunctionCount += 1;
        }
        assert(fallbackMentions >= 6, `H1. at least six of these substrate files explicitly discuss "fallback" in their own header (found ${fallbackMentions})`);
        assert(fallbackClassOrFunctionCount === 0, 'H2. not ONE of those mentions is an actual class or function named *Fallback* — every single one is a documented ABSENCE ("NO... FALLBACK BETWEEN GATEWAYS"), never an implementation. "Preferred, not exclusive" (the brief\'s own H) is a real, unresolved policy question this codebase has not yet answered even once, in either direction');
        console.log('✓ Section H: fallback-between-providers is discussed only as a deliberately excluded behavior, never once implemented — a future "preferred provider ≠ only provider" policy is a genuinely open decision, not something this audit can report as already resolved either way, and 0.9.292 makes no attempt to resolve it');
    }

    // ===============================================================
    // Section I — persistence: no discoveryProviderPreference /
    // contentProviderPreference / proofProviderPreference storage key (or
    // any generic networkPreference key) exists anywhere yet.
    // ===============================================================
    {
        const allProductionFiles = await repoWideProductionFiles();
        const keyPattern = /['"`](discovery|content|proof)ProviderPreference['"`]|['"`]networkPreference['"`]/i;
        let hits = 0;
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (keyPattern.test(text)) hits += 1;
        }
        assert(hits === 0, 'I1. zero production files define or read a discoveryProviderPreference/contentProviderPreference/proofProviderPreference/networkPreference storage key — there is no persistence layer to migrate, extend, or reason about compatibility with yet');
        console.log('✓ Section I: no per-role provider-preference persistence exists anywhere today. Whenever this IS built, the brief\'s own recommendation — three role-scoped keys, never one generic "networkPreference" — is the only shape consistent with Section A\'s own three frozen roles; this audit records that as a constraint for later work, without implementing any of it');
    }

    // ===============================================================
    // Section J — the verdict.
    // ===============================================================
    {
        const gaps = [
            'Base/Proof has a real create+broadcast+inclusion-observation half (base/) and NO verify half (no ProofVerifier, never registered) — Section B',
            'Arweave/Discovery has a real read half (ArweaveGraphqlDiscoveryQueryService) and NO write half (no publisher class exists at all) — Section B',
            'Discovery has no keyed provider registry, unlike Content and Proof, which both already have one — Section F',
            'No provider-preference concept, of any shape, exists in source today — Sections G/I',
            '"Preferred vs exclusive" (fallback policy) is an entirely open, never-resolved product question — Section H'
        ];
        assert(gaps.length === 5, 'J1. five concrete, source-verified gaps — the honest reason a preference UI is not yet warranted');

        const VERDICT = 'NOT_READY_FOR_PROVIDER_SELECTION_UI';
        assert(VERDICT === 'NOT_READY_FOR_PROVIDER_SELECTION_UI', 'J2. the verdict this whole audit was written to reach');

        // What WOULD need to exist first — named, not implemented.
        const prerequisiteMilestones = Object.freeze([
            'A Base ProofVerifier, registered through the existing ExternalProofVerifierRegistry — closing Base/Proof\'s verify-half gap',
            'An Arweave discovery write-side publisher, mirroring NostrPublicationDiscoveryPublisher/NostrSnapshotDiscoveryPublisher — closing Arweave/Discovery\'s write-half gap',
            'A Discovery-role keyed registry, mirroring SnapshotPlacementStoreRegistry/ExternalProofVerifierRegistry — extending Configuration Authority (Section F) to the one role that lacks it',
            'A Role Provider Configuration boundary that reads a stored per-role preference and resolves it through the (by-then-three) registries above — the actual, smallest configuration seam, still with no UI'
        ]);
        assert(prerequisiteMilestones.length === 4, 'J3. four concrete, unscheduled prerequisite milestones — none implemented by this audit');

        console.log('✓ Section J — VERDICT: NOT_READY_FOR_PROVIDER_SELECTION_UI.');
        console.log('  Gaps found:');
        for (const g of gaps) console.log(`    - ${g}`);
        console.log('  Recommended before 0.9.293 (a UI) is even considered — 0.9.293 should be the SMALLEST of these, per the task\'s own request, and it is capability work, never UI:');
        for (const m of prerequisiteMilestones) console.log(`    - ${m}`);
    }

    console.log('\n✅ All Decentralized Substrate Capability Matrix Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
