import { readFile, readdir } from 'node:fs/promises';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';

import { ContentStore } from '../content/ContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';

import { DecentralizedDiscoveryQueryService } from '../application/DecentralizedWorldDiscoveryQuery.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';

import { ProofVerifier } from '../anchoring/ProofVerifier.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { PublicationAnchorCreationCoordinator } from '../application/PublicationAnchorCreationCoordinator.js';

// 0.9.424 — Arweave Cross-Role Substrate Capability Audit.
//
// Type: test-only capability audit. Zero production changes.
//
// A user, having watched 0.9.421 (fan-out rejected), 0.9.422 (UI choice
// already reachable for CONTENT/PROOF, absent for ANNOUNCEMENT_AND_DISCOVERY),
// and 0.9.423 (a second ANNOUNCEMENT_AND_DISCOVERY provider deferred until
// one exists) settle three narrower questions, asked a broader one: Arweave
// already IS a real CONTENT substrate — should it also be exposed as a
// substrate for ANNOUNCEMENT_AND_DISCOVERY and PROOF_AND_ANCHORING? Their
// own brief named the exact trap to avoid: "Arweave can technically store
// data" does not, by itself, mean an Arweave publication satisfies this
// codebase's ANNOUNCEMENT_AND_DISCOVERY or PROOF_AND_ANCHORING semantics.
// Capability and role are two different questions, and this file answers
// each of the three roles independently, from real source only.
//
// THIS IS NOT A NEW QUESTION FOR ARWEAVE SPECIFICALLY — 0.9.292's own
// Decentralized Substrate Capability Matrix Audit already built exactly
// this per-provider-per-role matrix, and its own Arweave row already read:
//
//     Arweave | Discovery: ◐ (read-only)  | Content: ✓  | Proof: — (absent)
//
// Six milestones (0.9.293-0.9.301) then built the entire Role Provider
// Preference chain (vocabulary, persistence, resolution, application
// boundary), and three more (0.9.421-0.9.423) settled fan-out, UI
// reachability, and expansion readiness for the Discovery role
// specifically. NONE of the nine touched an Arweave discovery-write class,
// an Arweave proof-verify class, or an Arweave anchor-publish class — so
// this milestone's first job (Sections A-C) is confirming that row is
// STILL exactly what it was, from CURRENT source, never assumed carried
// forward from a stale audit. Its second job (Sections D-G) is what
// 0.9.292 explicitly declined to do for any provider: name, per role, the
// SMALLEST missing seam, and classify it — a missing CONCRETE PROVIDER
// CLASS (cheap: the surrounding registry/mechanism already exists and
// already reaches a real, route-reachable UI), or a missing MECHANISM
// ITSELF (expensive: no registry, no UI hook, nothing for a class to
// plug into even once written) — never conflating the two the way "just
// add Arweave" proposals usually do.
//
// THE MATRIX'S OWN BAR, CARRIED FORWARD UNCHANGED FROM 0.9.292: a cell is
// ✓ only when a concrete, constructible class exists in production source
// that actually satisfies the role's real interface (by `extends` or by
// this codebase's own established duck-typing) AND is actually reachable
// through whatever real mechanism (registry, fixed pipeline slot) that
// role uses in shipped code. A cell is ◐ when one real half exists and
// another real half does not. A cell is — when a repo-wide sweep confirms
// zero such class exists. Nothing below is ever asserted from prose alone.
//
// LETTERED SECTIONS:
//   A. CONTENT reconstructed — Arweave's already-proven role, re-verified,
//      never re-litigated.
//   B. ANNOUNCEMENT_AND_DISCOVERY re-verified fresh, current source only:
//      read half real, write half absent, and the ONE real write pipeline
//      today never offers Arweave that slot at all.
//   C. PROOF_AND_ANCHORING re-verified fresh: zero Arweave seam on either
//      the create or the verify side — but the two real registries this
//      role already runs through accept an unknown-in-advance key with no
//      registry code change, demonstrated by actually registering a
//      minimal test-local stand-in and round-tripping it.
//   D. Architectural fit, stated as a possibility only, never a capability:
//      the wire mechanisms a real Arweave Proof verifier or Discovery
//      publisher would need already have a proven, shipped analogue
//      elsewhere in this codebase's own Arweave adapters.
//   E. Role independence, live: ONE real Arweave transaction already
//      legitimately carries two distinct role-facts in shipped code today
//      (a `material` fact and a `discoveryEnvelope` fact) without those
//      facts ever collapsing into one identity.
//   F. No automatic cross-role publication and no fan-out — confirmed
//      absent by source sweep, not merely undocumented.
//   G. The UI seam: exactly which of the two missing halves, if built and
//      registered, would need zero UI change versus which role has no UI
//      mechanism to plug into regardless of Arweave.
//   H. The verdict, per role, using the vocabulary this milestone's own
//      brief asked for: PROVIDER_GAP vs MECHANISM_GAP vs ALREADY_COMPLETE.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any concrete `anchoring/ArweaveProofVerifier.js`, `anchoring/
//   ArweaveAnchorPublisher.js`, or `application/ArweaveDiscoveryPublisher.js`.**
//   Section C's own registration proof uses a throwaway, test-local stand-in
//   that is never exported, never imported by anything outside this file,
//   and never touches `anchoring/` or `application/`. Naming the seam is
//   this milestone's job; building it is real, unscheduled, later work.
// - **A `RoleProviderConfiguration`, a Discovery-role keyed registry, or
//   any change to `RoleAwareProviderResolver.js`.** Section B's own finding
//   — no real (non-inert) discoveryRegistry exists in production — is
//   exactly the MECHANISM_GAP 0.9.292 Section F and 0.9.423 already named;
//   this file confirms it is still true, and closes none of it.
// - **Automatic cross-role publication of any kind** ("uploading Content to
//   Arweave should also announce it" / "...should also anchor it"). Section
//   F proves no such path exists, and this milestone adds none.
// - **Any UI, panel, or preference control.** Nothing in `ui/` is edited.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Same recursive production-file sweep 0.9.292's own
// DecentralizedSubstrateCapabilityMatrixAudit.test.js already established
// — reimplemented here rather than imported, since tests/ files in this
// codebase never import collaborators from one another, only from
// production source.
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
    for (const dir of dirs) {
        await listJsFiles(dir, all);
    }
    return [...new Set(all)];
}

function neverCalled() {
    throw new Error('neverCalled: this audit checks class shape and registry composition, never live wire behavior');
}
const fakeSigner = { sign: neverCalled };

async function run() {
    const allProductionFiles = await repoWideProductionFiles();

    // ===============================================================
    // Section A — CONTENT reconstructed. Arweave's already-proven role,
    // re-verified from current source, never re-litigated.
    // ===============================================================
    {
        const arweaveContentStore = new ArweaveContentStore({ signer: fakeSigner, fetchImpl: neverCalled });
        check(arweaveContentStore instanceof ContentStore, 'A1. ArweaveContentStore is a real ContentStore (Snapshot half)');
        check(arweaveContentStore.storage === 'ar', 'A2. ArweaveContentStore.storage === "ar"');

        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(arweaveContentStore);
        check(registry.get('ar') === arweaveContentStore, 'A3. Arweave\'s ContentStore is genuinely retrievable through the same registry the real Snapshot placement pipeline resolves storage through — not merely "extends the base class"');

        const arweaveUploader = new ArweavePublicationMaterialUploader({ signer: fakeSigner, fetchImpl: neverCalled });
        check(typeof arweaveUploader.upload === 'function', 'A4. ArweavePublicationMaterialUploader is a real, separate write-only Content seam (Publication half)');
        check(arweaveUploader.storage === 'ar', 'A5. it too self-declares storage === "ar"');
        check(!(arweaveUploader instanceof ContentStore), 'A6. it does NOT extend ContentStore — a genuinely different shape from ArweaveContentStore despite the identical substrate and identical storage key');

        const arweaveResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: neverCalled });
        check(typeof arweaveResolver.retrieveByUri === 'function', 'A7. ArweaveWorldEncounterMaterialResolver is a THIRD, read-only Content seam (World Encounter half)');
        check(!(arweaveResolver instanceof ContentStore), 'A8. it does not extend ContentStore either — three Arweave Content classes, no shared base beyond one of the three');

        let mutualImports = 0;
        const uploaderSource = await source('application/ArweavePublicationMaterialUploader.js');
        const resolverSource = await source('application/ArweaveWorldEncounterMaterialResolver.js');
        const storeSource = await source('content/ArweaveContentStore.js');
        const importsName = (text, name) => new RegExp(`^import[^\\n]*\\b${name}\\b[^\\n]*from`, 'm').test(text);
        if (importsName(uploaderSource, 'ArweaveWorldEncounterMaterialResolver') || importsName(uploaderSource, 'ArweaveContentStore')) mutualImports += 1;
        if (importsName(resolverSource, 'ArweavePublicationMaterialUploader') || importsName(resolverSource, 'ArweaveContentStore')) mutualImports += 1;
        if (importsName(storeSource, 'ArweavePublicationMaterialUploader') || importsName(storeSource, 'ArweaveWorldEncounterMaterialResolver')) mutualImports += 1;
        check(mutualImports === 0, 'A9. the three Content-role Arweave classes remain mutually unaware of one another in current source (checked as real `import ... from` statements, never prose cross-references in a header comment) — still true after 0.9.293-0.9.423, exactly as 0.9.292 Section E found it');

        console.log('✓ Section A: Arweave/CONTENT reconstructed from current source — three real, independently-constructed, registry-reachable-at-least-once seams, unchanged since 0.9.292');
    }

    // ===============================================================
    // Section B — ANNOUNCEMENT_AND_DISCOVERY, re-verified fresh.
    // ===============================================================
    {
        const arweaveDiscovery = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: neverCalled });
        check(arweaveDiscovery instanceof DecentralizedDiscoveryQueryService, 'B1. ArweaveGraphqlDiscoveryQueryService is a real DecentralizedDiscoveryQueryService — the read half is real');
        const discoverySource = await source('application/ArweaveGraphqlDiscoveryQueryService.js');
        check(/this class never writes a[\s\S]{0,40}transaction or a[\s\S]{0,10}tag/i.test(discoverySource), 'B2. the class\'s own header states, in its own words, that it never writes — read from source, never inferred');

        let arweaveDiscoveryPublisherCount = 0;
        for (const file of allProductionFiles) {
            if (/^application\/Arweave.*Publisher\.js$/.test(file.replace(/^\.?\//, ''))) arweaveDiscoveryPublisherCount += 1;
        }
        check(arweaveDiscoveryPublisherCount === 0, 'B3. repo-wide, current: no application/Arweave*Publisher.js exists — the write half is still absent, confirmed fresh rather than assumed carried over from 0.9.292');

        // The one real, live write pipeline for this role today.
        const nostrPublisher = new NostrPublicationDiscoveryPublisher({ relayUrl: 'wss://x', discoveryTag: 't', publishImpl: neverCalled });
        check(typeof nostrPublisher.publish === 'function', 'B4. Nostr\'s own discovery-write half is real and complete, for comparison');
        const compositionSource = await source('application/PublicationDistributionRuntimeComposition.js');
        check(/import\s*\{\s*NostrPublicationDiscoveryPublisher\s*\}/.test(compositionSource), 'B5. the one real production composition that builds the discovery-write collaborator imports NostrPublicationDiscoveryPublisher');
        check(!/ArweaveDiscoveryPublisher|ArweaveAnnouncement/.test(compositionSource), 'B6. that same composition names no Arweave discovery-write class at all — Arweave never occupies this pipeline\'s discoveryPublisher slot in current source, only its materialUploader slot');

        // RoleAwareProviderResolver's own discoveryRegistry parameter is
        // real IN SHAPE (any object exposing get()) — confirm no real,
        // non-inert instance backs it anywhere in production today.
        let realDiscoveryRegistryConstructionCount = 0;
        let inertDiscoveryRegistryConstructionCount = 0;
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (!/new RoleAwareProviderResolver\(/.test(text)) continue;
            if (/discoveryRegistry:\s*inertRegistry/.test(text) || /discoveryRegistry:\s*\{\s*get:\s*\(\)\s*=>\s*null\s*\}/.test(text)) {
                inertDiscoveryRegistryConstructionCount += 1;
            } else if (/discoveryRegistry:/.test(text)) {
                realDiscoveryRegistryConstructionCount += 1;
            }
        }
        check(inertDiscoveryRegistryConstructionCount >= 1, 'B7. at least one real production call site constructs a RoleAwareProviderResolver with an explicitly inert discoveryRegistry stand-in');
        check(realDiscoveryRegistryConstructionCount === 0, 'B8. zero production call sites wire a real (non-inert) discoveryRegistry — even the new 0.9.293-0.9.301 preference-resolution chain has nothing for ANNOUNCEMENT_AND_DISCOVERY, Arweave included, to resolve into yet');

        console.log('✓ Section B: Arweave/ANNOUNCEMENT_AND_DISCOVERY = ◐, reconfirmed from current source — real read half, absent write half, and the role\'s own real write pipeline and its own preference-resolution registry both structurally exclude Arweave today, not by capability but by nothing having been built or wired for it yet');
    }

    // ===============================================================
    // Section C — PROOF_AND_ANCHORING, re-verified fresh, then a live
    // registration proof of exactly what would and would not need to
    // change to close the gap.
    // ===============================================================
    {
        let proofVerifierSubclassCount = 0;
        let arweaveProofVerifierCount = 0;
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (/extends\s+ProofVerifier\b/.test(text)) {
                proofVerifierSubclassCount += 1;
                if (/arweave/i.test(file)) arweaveProofVerifierCount += 1;
            }
        }
        check(proofVerifierSubclassCount === 1, `C1. exactly one class in the entire production tree extends ProofVerifier today (found ${proofVerifierSubclassCount}) — Bitcoin's, and Bitcoin's alone`);
        check(arweaveProofVerifierCount === 0, 'C2. zero of those are Arweave-named or Arweave-shaped — the verify half is absent, confirmed fresh');

        let arweaveAnchorPublisherCount = 0;
        for (const file of allProductionFiles) {
            if (/anchorType/.test(await source(file)) && /arweave/i.test(file)) arweaveAnchorPublisherCount += 1;
        }
        check(arweaveAnchorPublisherCount === 0, 'C3. zero Arweave-named files anywhere reference anchorType — the create half is equally absent, not merely the verify half');

        // Now prove what Section B could NOT prove for Discovery: that the
        // two real registries this role already runs through require zero
        // registry-code change to accept a provider keyed "arweave" — the
        // gap is a missing CLASS, not a missing MECHANISM. The stand-ins
        // below are throwaway, test-local, never exported, and satisfy
        // nothing beyond the exact minimal shape each registry's own
        // register() already checks for (anchorType/publish, or
        // anchorType/verify) — they are not, and must never be mistaken
        // for, a real Arweave proof or anchor implementation.
        class TestOnlyArweaveAnchorPublisherStandIn {
            get anchorType() { return 'arweave'; }
            async publish() { throw new Error('test-only stand-in: never actually invoked'); }
        }
        class TestOnlyArweaveProofVerifierStandIn extends ProofVerifier {
            get anchorType() { return 'arweave'; }
            async verify() { throw new Error('test-only stand-in: never actually invoked'); }
        }

        const publisherRegistry = new ExternalAnchorPublisherRegistry();
        const standInPublisher = new TestOnlyArweaveAnchorPublisherStandIn();
        publisherRegistry.register(standInPublisher);
        check(publisherRegistry.get('arweave') === standInPublisher, 'C4. ExternalAnchorPublisherRegistry accepts and round-trips an "arweave" anchorType with zero change to the registry\'s own code — the exact same register()/get() this role already uses for Bitcoin\'s own real publisher');

        const verifierRegistry = new ExternalProofVerifierRegistry();
        const standInVerifier = new TestOnlyArweaveProofVerifierStandIn();
        verifierRegistry.register(standInVerifier);
        check(verifierRegistry.get('arweave') === standInVerifier, 'C5. ExternalProofVerifierRegistry does the same for verification — no registry, no ExternalAnchorVerifier.js change, no CreateExternalPublicationAnchorUseCase.js change would be required to plug a real implementation in later');

        // Compare against the real Bitcoin registration this codebase
        // already ships, to show the stand-in was registered the
        // identical way, not a special-cased shortcut.
        const bitcoinVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: neverCalled });
        const mixedRegistry = new ExternalProofVerifierRegistry();
        mixedRegistry.register(bitcoinVerifier);
        mixedRegistry.register(standInVerifier);
        check(mixedRegistry.get('bitcoin-op-return') === bitcoinVerifier && mixedRegistry.get('arweave') === standInVerifier, 'C6. Bitcoin\'s real verifier and Arweave\'s stand-in coexist in the same registry instance, keyed independently, neither overwriting the other — the registry is already a multi-provider mechanism today, only ever short one real provider for Arweave');

        const coordinator = new PublicationAnchorCreationCoordinator({ execute: neverCalled }, publisherRegistry);
        check(coordinator.availableAnchorTypes().includes('arweave'), 'C7. the exact real UI-facing method (PublicationAnchorCreationCoordinator#availableAnchorTypes()) that ui/views/DecentralizedPublicationsView.js already renders a v-for over reports "arweave" the moment ANY object satisfying { anchorType, publish() } is registered — proving Section G\'s own UI-reachability claim ahead of naming it there');

        console.log('✓ Section C: Arweave/PROOF_AND_ANCHORING = — (absent), reconfirmed fresh — but demonstrated live that both real registries this role runs through, and the real UI method that reads one of them, already accept an unknown-in-advance "arweave" key with zero code change; the entire gap is two missing concrete classes, never a missing mechanism');
    }

    // ===============================================================
    // Section D — architectural fit, stated as a possibility only. Never
    // "this already works," always "the wire pattern this would need
    // already has a proven, shipped analogue elsewhere in this exact
    // codebase's own Arweave adapters."
    // ===============================================================
    {
        const bitcoinVerifierSource = await source('anchoring/BitcoinOpReturnProofVerifier.js');
        check(/verify\(proof,\s*\{\s*contentHash\s*\}/.test(bitcoinVerifierSource), 'D1. Bitcoin\'s real verify() contract, read from source: verify(proof, { contentHash }) — fetch the named transaction, require it confirmed, then match an embedded value against contentHash');

        const arweaveDiscoverySource = await source('application/ArweaveGraphqlDiscoveryQueryService.js');
        check(/arweave\.net\/graphql/.test(arweaveDiscoverySource), 'D2. this codebase already ships a real, live Arweave GraphQL tag-query mechanism (POST arweave.net/graphql, filter transactions by a named Tag) — the exact query shape a hypothetical Arweave ProofVerifier would need to fetch one transaction by id and inspect its own tags, never a new wire protocol this codebase would have to invent from nothing');

        const arweaveUploaderSource = await source('application/ArweavePublicationMaterialUploader.js');
        check(/signer\.sign\(material\)/.test(arweaveUploaderSource) && /never knows what an Arweave transaction[\s\S]{0,80}owner, tags, signature/i.test(arweaveUploaderSource), 'D3. this codebase\'s real Arweave write path already delegates the transaction\'s own tags entirely to an injected, opaque signer — nothing in the uploader\'s own contract forbids that signer from attaching a discovery-envelope or a content-hash-committing tag; it simply is not asked to today');

        console.log('✓ Section D: a real Arweave ProofVerifier or a real Arweave discovery-write publisher, if ever built, would each reuse a wire pattern this codebase already runs live for Arweave today (tag-based GraphQL read; opaque-signer-carried tag write) — a plausible, evidence-grounded architectural fit, explicitly never asserted as existing capability');
    }

    // ===============================================================
    // Section E — role independence, live: one real Arweave transaction
    // already legitimately carries two distinct role-facts in shipped
    // code, without those facts ever collapsing into one identity.
    // ===============================================================
    {
        const publication = { id: 'pub-424', signature: 'sig-424' };
        const distribution = describePublicationDistribution({ publication, materialUri: 'ar://abc123', materialStorage: 'ar' });
        check(distribution !== null, 'E1. a real distribution description is produced for a signed publication with an Arweave materialUri');
        check(distribution.material.uri === 'ar://abc123' && distribution.material.storage === 'ar', 'E2. the CONTENT fact names the Arweave transaction directly');
        check(distribution.discoveryEnvelope.uri === 'ar://abc123', 'E3. the SAME transaction id is exactly what the ANNOUNCEMENT_AND_DISCOVERY fact (discoveryEnvelope.uri) names — one real Arweave transaction, already, today, feeding two role-facts');
        check(distribution.material !== distribution.discoveryEnvelope, 'E4. yet the two facts remain two distinct objects — never unified into one identity even though they share the same underlying uri, exactly the "same substrate does not imply same architectural role" invariant 0.9.292 Section E already established for Content alone, now confirmed to hold ACROSS roles as well');
        check(Object.keys(distribution.discoveryEnvelope).sort().join(',') !== Object.keys(distribution.material).sort().join(','), 'E5. the two facts do not even share the same shape — discoveryEnvelope carries protocol/version/kind/objectId/uri, material carries uri/storage — reinforcing that they are independently-defined role contracts that merely happen to be populated from the same value here');

        console.log('✓ Section E: role membership stays explicit in shipped code even when one real Arweave transaction legitimately backs more than one role-fact — the CONTENT fact and the (Nostr-carried) ANNOUNCEMENT_AND_DISCOVERY fact about that same transaction never collapse into one object or one identity');
    }

    // ===============================================================
    // Section F — no automatic cross-role publication, no fan-out.
    // Confirmed absent by source sweep, never merely undocumented.
    // ===============================================================
    {
        const executorSource = await source('application/PublicationDistributionExecutor.js');
        check(/materialUploader,\s*distributionDescriptor,\s*discoveryPublisher/.test(executorSource.replace(/\s+/g, ' ')), 'F1. the real distribution executor takes materialUploader AND discoveryPublisher as two explicit, caller-supplied collaborators — neither is derived from, defaulted from, or triggered by the other');

        const anchorCreationSource = await source('application/CreateExternalPublicationAnchorUseCase.js');
        check(!/ArweavePublicationMaterialUploader|PublicationDistribution/.test(anchorCreationSource), 'F2. anchor creation (PROOF_AND_ANCHORING\'s own real write path) imports nothing from Arweave Content or from the Publication distribution pipeline — creating an anchor is never triggered by, or derived from, an Arweave content upload');

        const distributionRuntimeSource = await source('application/PublicationDistributionRuntimeComposition.js');
        check(!/PublicationAnchor|ExternalAnchorPublisherRegistry|CreateExternalPublicationAnchorUseCase/.test(distributionRuntimeSource), 'F3. the Content/Discovery distribution composition imports nothing from anchor creation either — the reverse direction is equally absent, confirming this is a genuine architectural boundary, not an accident of which file happened to import which');

        let multiSelectAnchorOrStorageMarkup = 0;
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const anchorSection = viewSource.slice(viewSource.indexOf('availableAnchorTypes'), viewSource.indexOf('availableAnchorTypes') + 4000);
        if (/type=["']checkbox["']/.test(anchorSection)) multiSelectAnchorOrStorageMarkup += 1;
        check(multiSelectAnchorOrStorageMarkup === 0, 'F4. the real anchor-type UI region contains no checkbox/multi-select markup — choosing a provider for a role remains "one action, one provider," never "select several and fan out," reconfirmed at the UI layer specifically for this milestone rather than assumed from 0.9.421');

        console.log('✓ Section F: no path anywhere in current source lets choosing Arweave for one role automatically produce, trigger, or imply a publication in a different role — every cross-role appearance of Arweave in this codebase remains an explicit, separately-invoked action, exactly the restraint 0.9.421 already established and this milestone re-confirms holds for Arweave specifically');
    }

    // ===============================================================
    // Section G — the UI seam: which missing half, if built and
    // registered, needs zero UI change, versus which role has nothing to
    // plug into regardless of Arweave.
    // ===============================================================
    {
        const publisherRegistry = new ExternalAnchorPublisherRegistry();
        const coordinatorBefore = new PublicationAnchorCreationCoordinator({ execute: neverCalled }, publisherRegistry);
        check(coordinatorBefore.availableAnchorTypes().length === 0, 'G1. before any Arweave anchor publisher is registered, the real UI-facing method reports none — establishing the "before" state honestly');
        class MinimalStandIn {
            get anchorType() { return 'arweave'; }
            async publish() { throw new Error('never invoked'); }
        }
        publisherRegistry.register(new MinimalStandIn());
        const coordinatorAfter = new PublicationAnchorCreationCoordinator({ execute: neverCalled }, publisherRegistry);
        check(coordinatorAfter.availableAnchorTypes().length === 1 && coordinatorAfter.availableAnchorTypes()[0] === 'arweave', 'G2. after registering ONE object satisfying { anchorType, publish() } — no UI file touched, no route added — the same real coordinator method now reports it, meaning ui/views/DecentralizedPublicationsView.js\'s existing v-for would render a second real card with zero UI code change once a real Arweave anchor publisher is registered');

        const compositionSourcesToCheckForNewDiscoveryUiHook = [
            'ui/views/DecentralizedPublicationsView.js',
            'application/PublicationDistributionOrchestrator.js'
        ];
        let discoveryUiHookExists = 0;
        for (const file of compositionSourcesToCheckForNewDiscoveryUiHook) {
            const text = await source(file);
            if (/availableDiscoveryTypes|availableAnnouncementTypes|discoveryProviderRegistry/i.test(text)) discoveryUiHookExists += 1;
        }
        check(discoveryUiHookExists === 0, 'G3. by contrast, no equivalent method or registry hook exists anywhere for ANNOUNCEMENT_AND_DISCOVERY — registering a hypothetical Arweave discovery publisher would have nothing to register INTO; this is 0.9.422/0.9.423\'s own already-established MECHANISM_GAP, reconfirmed unchanged, not a new finding this milestone invents');

        console.log('✓ Section G: PROOF_AND_ANCHORING\'s missing Arweave half is a pure PROVIDER_GAP — the registry and the UI method that reads it already exist and already reach a real route, proven by live registration above. ANNOUNCEMENT_AND_DISCOVERY\'s missing Arweave half is compounded by a MECHANISM_GAP — no registry, no UI method, nothing to plug a class into even once one is written, exactly as 0.9.422/0.9.423 already found for that role in general, now confirmed to apply to Arweave specifically, not only to a hypothetical "second provider" in the abstract');
    }

    // ===============================================================
    // Section H — the verdict.
    // ===============================================================
    {
        const VERDICT = Object.freeze({
            [RoleProviderRole.CONTENT]: 'ALREADY_COMPLETE',
            [RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY]: 'PROVIDER_GAP_PLUS_MECHANISM_GAP',
            [RoleProviderRole.PROOF_AND_ANCHORING]: 'PROVIDER_GAP_ONLY'
        });
        check(Object.keys(VERDICT).length === 3, 'H1. one verdict per role, matching RoleProviderRole\'s own closed vocabulary exactly');

        // The preference layer's own explicit design (core/
        // RoleProviderPreference.js: "no capability validation") means a
        // preference naming Arweave for either gap role already
        // constructs successfully today — proving the gap is real
        // capability, never a validation this file, or any file, would
        // need to relax first.
        for (const role of Object.values(RoleProviderRole)) {
            const preference = new RoleProviderPreference({ role, providerKey: 'arweave' });
            check(preference.role === role && preference.providerKey === 'arweave', `H2. RoleProviderPreference({ role: ${role}, providerKey: 'arweave' }) constructs successfully today regardless of real capability — confirming, as core/RoleProviderPreference.js's own header states, that "no capability validation" already means this milestone's own verdicts are never blocked, or unblocked, by that file`);
        }

        console.log('='.repeat(78));
        console.log('ARWEAVE CROSS-ROLE SUBSTRATE CAPABILITY — FINAL VERDICT');
        console.log('='.repeat(78));
        console.log('  CONTENT                 : ALREADY_COMPLETE');
        console.log('    Three real, independently-constructed seams (Snapshot/');
        console.log('    Publication/World-Encounter), at least one already reachable');
        console.log('    through a real registry and a real route. Nothing to build.');
        console.log('  ANNOUNCEMENT_AND_DISCOVERY : PROVIDER_GAP + MECHANISM_GAP');
        console.log('    A real read half exists (ArweaveGraphqlDiscoveryQueryService).');
        console.log('    The write half is an entirely missing class AND, even if');
        console.log('    written, has no registry or UI hook to plug into today —');
        console.log('    reconfirms 0.9.422/0.9.423\'s own verdict for this role,');
        console.log('    ANNOUNCEMENT_DISCOVERY_EXPANSION_DEFERRED_UNTIL_SECOND_PROVIDER,');
        console.log('    now shown to hold for Arweave specifically, not only in the');
        console.log('    abstract.');
        console.log('  PROOF_AND_ANCHORING     : PROVIDER_GAP ONLY');
        console.log('    Zero classes on either the create or verify side. BUT both');
        console.log('    real registries this role already runs through (Section C),');
        console.log('    and the real UI method that reads one of them (Section G),');
        console.log('    already accept an "arweave" key with zero code change —');
        console.log('    demonstrated live, not asserted. Of the two gaps, this is the');
        console.log('    cheaper one to close, structurally, whenever a real Arweave');
        console.log('    proof-verify and anchor-publish implementation is scheduled.');
        console.log('');
        console.log('  Cross-cutting findings, true of every role: Arweave\'s "could');
        console.log('  technically do this" is never treated as evidence of "already');
        console.log('  does this" (Sections B/C/D keep the two apart explicitly).');
        console.log('  One real Arweave transaction can already, live, legitimately');
        console.log('  carry more than one role-fact without those facts merging');
        console.log('  identity (Section E). No path anywhere lets choosing Arweave');
        console.log('  for one role automatically produce a publication in another');
        console.log('  role, and no fan-out exists at the UI layer either (Section F).');
        console.log('  RoleProviderPreference\'s own by-design "no capability');
        console.log('  validation" (Section H) means none of this milestone\'s');
        console.log('  findings were ever gate-able from that layer in the first');
        console.log('  place — the gate, for both open roles, is real production code');
        console.log('  that does not exist yet, named precisely by role above.');
        console.log('');
        console.log('  Decision: NO_BUILD_THIS_MILESTONE. This audit names two real,');
        console.log('  precisely-scoped, independently-schedulable future seams —');
        console.log('  an Arweave ProofVerifier + AnchorPublisher pair (cheap: plugs');
        console.log('  into existing registries and existing UI with zero mechanism');
        console.log('  work), and an Arweave discovery-write publisher (expensive:');
        console.log('  needs its own registry and UI hook built first, exactly the');
        console.log('  MECHANISM_GAP 0.9.423 already deferred) — and builds neither.');
        console.log('='.repeat(78));

        console.log('\n✅ All Arweave Cross-Role Substrate Capability Audit tests passed.');
        console.log(`(${assertionCount} assertions)`);
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
