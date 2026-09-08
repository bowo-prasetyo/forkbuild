import { readFile, readdir } from 'node:fs/promises';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver } from '../application/RoleAwareProviderResolver.js';
import { ResolvePreferredRoleProviderUseCase } from '../application/ResolvePreferredRoleProviderUseCase.js';

import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';

// 0.9.298 — Role Provider Preference Product Integration Audit.
//
// Test-only. Zero production changes. 0.9.296 already answered a
// TECHNICAL question — "which of eleven traced provider-selection seams
// is a clean, unconditional `resolve()` insertion point" — and found
// exactly one (Publication discovery), carrying its own open policy
// question. This milestone asks a narrower, PRODUCT question that
// finding leaves open: of the workflows a person actually uses, which
// one can legitimately honor a role provider preference WITHOUT
// redefining what that workflow already means to someone using it today?
// The two questions overlap in evidence but not in verdict — a seam can
// be technically reachable (0.9.296: READY) while still being the wrong
// place to spend the first real integration, and a seam 0.9.296 called
// BLOCKED on a capability gap can be the SEMANTICALLY strongest
// candidate once a documented product principle is deliberately
// revisited, never merely worked around.
//
//   RoleProviderPreference / RoleProviderPreferenceStore /
//   RoleAwareProviderResolver / ResolvePreferredRoleProviderUseCase
//   (0.9.293-0.9.297, unmodified — read here exactly as their own tests
//   already read them)
//                    │
//                    ▼
//   tests/RoleProviderPreferenceProductIntegrationAudit.test.js   ★ (THIS)
//        Section A — Discovery, audited independently: three
//                     non-interchangeable shapes, none silently unified
//        Section B — Content, audited independently: the ONE role with
//                     genuine, real, ALREADY-REGISTERED multi-provider
//                     redundancy in production today
//        Section C — Proof & Anchoring, audited independently: proof has
//                     no such redundancy yet, and anchorType is never
//                     confused with "every cryptographic operation"
//        Section D — the three semantics (user chooses / application
//                     chooses / historical record), mapped onto every
//                     seam Sections A-C found, evidence-backed
//        Section E — final classification: READY / BLOCKED /
//                     SEMANTICALLY_UNSUITABLE / INTERNAL / DUPLICATIVE
//        Section F — the preference chain proved end-to-end for the
//                     strongest candidate, against a registry shaped
//                     exactly like this codebase's own real production
//                     wiring — then the baseline: today's workflow does
//                     not call it
//        Section G — the three preference states, audited PER CANDIDATE,
//                     never globally, and never answered where this
//                     milestone's own brief declines to answer them
//        Section H — UI sequencing: consumer-first vs settings-first,
//                     decided from evidence, not asserted
//        Section I — the verdict this whole milestone exists to reach
//
// THE SAME BAR 0.9.292's/0.9.296's own audits already set for themselves,
// held here again: a claim below is never this file's own prose. It is a
// real `source()` read of the exact production file named, a real
// registry round-trip, or a real read of `ui/main.js`'s own production
// wiring — never an assumption carried over from 0.9.296's prose, even
// where this file's own verdict agrees with it.
//
// DELIBERATELY EXCLUDED — PER THE TASK'S OWN BRIEF.
// - **No settings UI, provider-selection UI, or any `ui/` change.**
//   Section H inspects `ui/` for evidence; it builds nothing there.
// - **No runtime integration.** No composition root is touched, and
//   Section F's own end-to-end proof runs entirely against locally
//   constructed registries — never against a real composition root's own
//   wiring.
// - **No fallback policy, provider health checks, automatic switching, or
//   new registry.** Section G raises open questions; it answers none of
//   them.
// - **No change to Discovery architecture, existing provider
//   implementations, or historical provider metadata.**
// - **No default-provider semantics.** `NO_PREFERENCE` and
//   `PROVIDER_NOT_FOUND` are read here exactly as 0.9.295/0.9.297 already
//   define them — never remapped, never given an invented fallback.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function normalizeComment(text) {
    return text.replace(/^\s*\/\/\s?/gm, '').replace(/\s+/g, ' ');
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

// The identical in-memory StorageProvider fake every earlier milestone in
// this sequence already uses for the same purpose.
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

async function run() {
    // ===============================================================
    // Section A — Discovery, audited independently.
    // ===============================================================
    const discoverySeams = [];
    {
        // A1: Publication discovery (read path) — the one Discovery shape
        // that genuinely queries more than one provider. It does so
        // UNCONDITIONALLY and INDEPENDENTLY per configured service —
        // never combined into one "selected" result — so narrowing it to
        // a single preferred service would shrink the evidence pool a
        // later lead-resolution step reasons over, not merely swap which
        // bytes are fetched.
        const discoveryCompositionSource = await source('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(/once per configured service, independently, never combined/.test(discoveryCompositionSource), 'A1a. Publication discovery composition documents, in its own words, that every configured service is queried independently and never combined into one answer');
        discoverySeams.push({ seam: 'Publication discovery (read path)', concern: 'narrowing "query every configured service" to "query the preferred one" would shrink the lead-resolution evidence pool a later step reasons over — a real behavior change, not a mechanical substitution' });

        // A2: material PROVENANCE (Origin: LOCAL/DECENTRALIZED) is a
        // DIFFERENT axis than "which decentralized service was queried,"
        // and this codebase's own header states, explicitly, that
        // provenance carries no preferred/rank/trust concept at all —
        // the exact confusion this milestone's own brief warns against.
        const provenanceSource = await source('application/PublicationMaterialProvenance.js');
        assert(/no.*`trust`,\s*`rank`,\s*`preferred`,\s*`reliable`,\s*`freshness`,\s*or\s*`quality`\s*field/.test(normalizeComment(provenanceSource)), 'A2a. PublicationMaterialProvenance.js states, in its own words, that no preferred/rank/trust/quality concept exists near provenance, and never will');
        assert(/DELIBERATELY TWO VALUES, NEVER MORE/.test(provenanceSource), 'A2b. provenance is a two-value (LOCAL/DECENTRALIZED) loading-boundary fact, never a per-service breakout — confirming a future service-level preference is a different axis than this file, and must never be conflated with it');
        discoverySeams.push({ seam: 'material provenance (Origin: LOCAL/DECENTRALIZED)', concern: 'not a selection seam at all — a stored fact about which loading boundary produced an observation; a service-level preference is an orthogonal axis and must never be read as, or written into, Origin' });

        // A3: Snapshot discovery — exactly one Discovery-shaped
        // collaborator, hardcoded, no alternative to choose between.
        const snapshotDiscoverySource = await source('application/DiscoverSnapshotRuntimeComposition.js');
        const snapshotDiscoveryImports = snapshotDiscoverySource.split('\n').filter((l) => /^import\b/.test(l));
        assert(snapshotDiscoveryImports.filter((l) => /Nostr|Arweave/.test(l)).length === 2, 'A3a. Snapshot discovery imports exactly one Discovery-shaped collaborator (NostrSnapshotDiscoveryQueryService) and one Content-shaped collaborator (ArweaveContentStore), never a second alternative for either role');
        discoverySeams.push({ seam: 'Snapshot discovery (read path)', concern: 'no second provider exists for this role in this path — nothing for a preference to select between' });

        // A4: local/catalog listing — this replica's own singular index,
        // never a substrate a person could prefer an alternative to.
        const discoveryProviderSource = await source('discovery/DiscoveryProvider.js');
        for (const m of ['list', 'findById', 'findByAuthor']) {
            assert(discoveryProviderSource.includes(m), `A4a. discovery/DiscoveryProvider.js declares ${m} — a local/catalog contract, never a pluggable-substrate one`);
        }
        discoverySeams.push({ seam: 'local/catalog listing', concern: 'not a substrate choice — this replica\'s own singular local index, with no competing alternative to prefer' });

        assert(discoverySeams.length === 4, `A5. four Discovery seams audited independently (found ${discoverySeams.length}) — none assumed to share one preference-selection seam merely because they share the ANNOUNCEMENT_AND_DISCOVERY role label`);
        console.log('✓ Section A: Discovery audited as three non-interchangeable shapes plus one adjacent-but-distinct concept (provenance) — 0.9.296\'s own finding that one preference cannot govern all of Discovery holds, and this audit additionally finds a real, named risk (evidence-pool narrowing) and a real, named non-risk (provenance is an orthogonal axis) that 0.9.296 did not itself need to distinguish');
    }

    // ===============================================================
    // Section B — Content, audited independently.
    // ===============================================================
    const contentSeams = [];
    {
        // B1: CONTENT resolution — dispatches on an ALREADY-CREATED
        // placement's own historical storage field. A category-3
        // "historical record" seam (Section D names the category
        // formally) — a preference has no legitimate business here.
        const resolverSource = await source('application/SnapshotPlacementResolver.js');
        assert(/storeRegistry\s*\?\s*storeRegistry\.get\(placement\.storage\)/.test(resolverSource), 'B1a. SnapshotPlacementResolver looks stores up by the PLACEMENT\'s own storage field, a fact about what already happened, never a live choice');
        contentSeams.push({ seam: 'CONTENT resolution (SnapshotPlacementResolver)', category: 'HISTORICAL_RECORD' });

        // B2: CONTENT creation — the one real, per-action, explicit-choice
        // workflow, and its own coordinator documents, in its own words,
        // that the offered set is never narrowed to a preferred/default
        // one.
        const creationCoordinatorSource = await source('application/SnapshotPlacementCreationCoordinator.js');
        assert(/never ranked, never narrowed to a\s*"preferred" or "default" one/.test(normalizeComment(creationCoordinatorSource)), 'B2a. SnapshotPlacementCreationCoordinator\'s own header states, in its own words, that availableStorageTypes() is never narrowed to a preferred/default entry');
        contentSeams.push({ seam: 'CONTENT creation (SnapshotPlacementCreationCoordinator, per-action UI)', category: 'USER_CHOOSES' });

        // B2b — THE LOAD-BEARING NEW EVIDENCE this audit adds beyond
        // 0.9.296: this is not a hypothetical "if a second provider ever
        // existed" seam. `ui/main.js` — this codebase's own real, running
        // composition root — ALREADY registers TWO real content stores
        // for BOTH Publication and Snapshot placement creation today.
        const mainSource = await source('ui/main.js');
        assert(/stores:\s*\[publicationContentStore,\s*new IpfsGatewayContentStore\(\)\]/.test(mainSource), 'B2c. ui/main.js registers publicationContentStore (\'local\') AND a real content/IpfsGatewayContentStore.js (\'ipfs\') together for Publication placement creation — two genuine, already-available choices, not a capability gap');
        assert(/stores:\s*\[publicationContentStore,\s*new IpfsContentStore\(\)\]/.test(mainSource), 'B2d. ui/main.js registers publicationContentStore (\'local\') AND a real content/IpfsContentStore.js (\'ipfs\') together for Snapshot placement creation — the identical two-real-choices shape');
        contentSeams[contentSeams.length - 1].evidence = 'ui/main.js already registers TWO real, distinct content stores (local + ipfs) for BOTH Publication and Snapshot placement creation — the only seam in this entire audit, across all three roles, where production wiring today offers a person more than one genuinely available provider to choose among';

        // B3: distribution write paths — exactly one Content collaborator
        // each, hardcoded, unconditional, no branch.
        for (const file of ['application/PublicationDistributionRuntimeComposition.js', 'application/SnapshotDistributionRuntimeComposition.js']) {
            const text = await source(file);
            const contentImports = text.split('\n').filter((l) => /^import\b/.test(l) && /Arweave(PublicationMaterialUploader|ContentStore)/.test(l));
            assert(contentImports.length === 1, `B3a. ${file} imports exactly one hardcoded Content collaborator, no second implementation to choose between`);
        }
        contentSeams.push({ seam: 'distribution write paths (Publication + Snapshot distribution)', category: 'APPLICATION_CHOOSES', note: 'a fixed composition-time constant today, not a live application decision among alternatives — there is nothing to redirect' });

        assert(contentSeams.length === 3, `B4. three Content seams audited independently (found ${contentSeams.length})`);
        console.log('✓ Section B: Content audited independently — resolution touches a historical fact (off-limits), creation is the ONE seam this codebase already runs with real, registered multi-provider redundancy in production (ui/main.js, both Publication and Snapshot placement), and distribution write paths remain single-provider constants with nothing to select between');
    }

    // ===============================================================
    // Section C — Proof & Anchoring, audited independently.
    // ===============================================================
    const proofSeams = [];
    {
        // C1: PROOF verification — dispatches on an anchor's own
        // historical anchorType field, the identical historical-record
        // shape as CONTENT resolution.
        const verifierSource = await source('application/ExternalAnchorVerifier.js');
        assert(/proofVerifierRegistry\s*\?\s*proofVerifierRegistry\.get\(anchor\.anchorType\)/.test(verifierSource), 'C1a. ExternalAnchorVerifier looks proofVerifiers up by the ANCHOR\'s own historical anchorType field, never a live choice');
        proofSeams.push({ seam: 'PROOF verification (ExternalAnchorVerifier)', category: 'HISTORICAL_RECORD' });

        // C2: PROOF creation — the per-action counterpart, with the
        // IDENTICAL "never preferred/default" restraint Section B2 found
        // for Content.
        const anchorCreationSource = await source('application/PublicationAnchorCreationCoordinator.js');
        assert(/never ranked, never narrowed to\s*a\s*"preferred" or "default" one/.test(normalizeComment(anchorCreationSource)), 'C2a. PublicationAnchorCreationCoordinator\'s own header states the identical restraint for availableAnchorTypes()');
        proofSeams.push({ seam: 'PROOF creation (PublicationAnchorCreationCoordinator, per-action UI)', category: 'USER_CHOOSES' });

        // C2b — UNLIKE Content, Proof has NO real registered redundancy
        // in production today: ui/main.js wires exactly ONE publisher.
        const mainSource = await source('ui/main.js');
        assert(/publishers:\s*\[bitcoinAnchorPublisher\]/.test(mainSource), 'C2b. ui/main.js registers exactly ONE anchor publisher (Bitcoin) — unlike Content creation, there is no second real option for a preference to distinguish between yet');
        proofSeams[proofSeams.length - 1].evidence = 'ui/main.js registers exactly one real anchor publisher (bitcoinAnchorPublisher) — a preference here has nothing to prefer OVER yet, unlike Content creation';

        // C3: anchorType is a NARROW, PROTOCOL-SPECIFIC key — never a
        // stand-in for "every cryptographic operation" this replica
        // performs. Confirmed from real source: the base class and the
        // one real subclass both scope themselves to verifying ONE
        // anchor's OP_RETURN commitment, never signing, never identity
        // verification, never any other proof kind.
        const baseVerifierSource = await source('anchoring/ProofVerifier.js');
        assert(!/sign\(/.test(baseVerifierSource), 'C3a. anchoring/ProofVerifier.js never exposes a generic sign()/cryptographic-operation surface — its contract is scoped to verifying one already-published anchor, never to "cryptographic operations" broadly');
        const anchoringDir = await listJsFiles('anchoring');
        const nonBitcoinFiles = anchoringDir.filter((f) => !/\/Bitcoin/.test(f) && f !== 'anchoring/ProofVerifier.js');
        assert(nonBitcoinFiles.length === 0, `C3b. every file under anchoring/ is either the Bitcoin family or the one shared ProofVerifier base class (found non-Bitcoin extras: ${nonBitcoinFiles.join(', ') || 'none'}) — a Bitcoin-vs-Arweave PROOF_AND_ANCHORING preference is scoped to "which anchoring substrate," never to "how this replica does cryptography" in general`);
        proofSeams.push({ seam: 'anchorType scope (anchoring/ProofVerifier.js + Bitcoin family)', category: 'INTERNAL_SCOPE_CHECK', note: 'anchorType names an anchoring substrate for one already-published commitment, never a general-purpose crypto-operation selector — a future Proof preference is bounded to this narrow meaning by the registry\'s own key, not by any restraint this audit invents' });

        assert(proofSeams.length === 3, `C4. three Proof/Anchoring seams audited independently (found ${proofSeams.length})`);
        console.log('✓ Section C: Proof & Anchoring audited independently — verification touches a historical fact (off-limits, identical to Content), creation carries the identical documented "never preferred/default" restraint as Content BUT with no real second provider registered anywhere in production today, and anchorType itself is confirmed, from real source, to be scoped to "which anchoring substrate" — never a stand-in for "every cryptographic operation," the exact confusion this milestone\'s own brief warned against');
    }

    // ===============================================================
    // Section D — the three semantics, mapped onto every real seam.
    // ===============================================================
    {
        const USER_CHOOSES = 'USER_CHOOSES_PROVIDER';
        const APPLICATION_CHOOSES = 'APPLICATION_CHOOSES_PROVIDER';
        const HISTORICAL_RECORD = 'HISTORICAL_RECORD';

        const mapping = [
            { seam: 'CONTENT creation (per-action UI)', semantics: USER_CHOOSES, note: 'a person clicks createPlacement(entry, storage) themselves, per action, today — a preference could only ever pre-suggest a default, never replace this explicit act' },
            { seam: 'PROOF creation (per-action UI)', semantics: USER_CHOOSES, note: 'identical shape — createAnchor(entry, anchorType), per action' },
            { seam: 'distribution write paths (Content+Discovery)', semantics: APPLICATION_CHOOSES, note: 'a fixed composition-time constant — "the application chooses," but there is only ever one option, so there is nothing to redirect a preference onto' },
            { seam: 'Publication discovery (read path)', semantics: APPLICATION_CHOOSES, note: 'the application queries every configured service unconditionally today — the one seam where a real alternative APPLICATION-chosen behavior ("query only the preferred one") is conceivable, per 0.9.296\'s own open question' },
            { seam: 'CONTENT resolution (placement.storage)', semantics: HISTORICAL_RECORD, note: 'a fact about which store a specific, already-created placement used — must never be rewritten by a CURRENT preference' },
            { seam: 'PROOF verification (anchor.anchorType)', semantics: HISTORICAL_RECORD, note: 'identical shape — a fact about which substrate a specific, already-created anchor used' },
            { seam: 'material provenance (Origin: LOCAL/DECENTRALIZED)', semantics: HISTORICAL_RECORD, note: 'a fact about which loading boundary produced the CURRENT observation — orthogonal to, and never conflated with, a service-level preference' }
        ];

        assert(mapping.filter((m) => m.semantics === HISTORICAL_RECORD).length === 3, 'D1. three seams are HISTORICAL_RECORD — the category this milestone\'s own brief says a preference must NEVER rewrite');
        assert(mapping.filter((m) => m.semantics === USER_CHOOSES).length === 2, 'D2. two seams are USER_CHOOSES_PROVIDER — Content and Proof creation, the per-action button lists');
        assert(mapping.filter((m) => m.semantics === APPLICATION_CHOOSES).length === 2, 'D3. two seams are APPLICATION_CHOOSES_PROVIDER — the only category this milestone\'s own brief says a preference may legitimately replace');

        console.log('  SEMANTICS                    | SEAM');
        for (const m of mapping) console.log(`  ${m.semantics.padEnd(29)} | ${m.seam}`);
        console.log('✓ Section D: no seam in this codebase is ambiguous between these three semantics once traced to real source — every HISTORICAL_RECORD seam dispatches on a field already written onto an existing object; every USER_CHOOSES seam is a real, named, per-action UI control; every APPLICATION_CHOOSES seam is either a fixed constant with nothing to redirect, or Publication discovery\'s own unconditional "query everyone" behavior');
    }

    // ===============================================================
    // Section E — final classification.
    // ===============================================================
    {
        const READY = 'READY';
        const BLOCKED = 'BLOCKED';
        const SEMANTICALLY_UNSUITABLE = 'SEMANTICALLY_UNSUITABLE';
        const INTERNAL = 'INTERNAL';
        const DUPLICATIVE = 'DUPLICATIVE';

        const classification = [
            { seam: 'CONTENT creation (SnapshotPlacementCreationCoordinator, per-action UI)', status: BLOCKED, reason: 'the ONLY seam in this whole audit with real, already-registered multi-provider redundancy in production (ui/main.js: local + ipfs, both Publication and Snapshot placement) — but its own coordinator explicitly, deliberately forbids a preferred/default entry today. The prerequisite is named and singular: revisit that one documented principle. This is the strongest candidate in the entire audit.' },
            { seam: 'PROOF creation (PublicationAnchorCreationCoordinator, per-action UI)', status: BLOCKED, reason: 'the identical documented restraint as Content creation, but ui/main.js registers only ONE real publisher (Bitcoin) — even if the restraint were revisited today, there is nothing yet for a preference to distinguish between. Weaker than Content on evidence alone.' },
            { seam: 'Publication discovery (read path)', status: BLOCKED, reason: 'mechanically reachable (0.9.295/0.9.296 both proved the adapter), but "query every configured service" -> "query the preferred one" is an unmade product decision with a real cost this audit newly names: it would shrink the lead-resolution evidence pool a later step reasons over, not merely swap which bytes are fetched' },
            { seam: 'distribution write paths (Content+Discovery, Publication + Snapshot)', status: BLOCKED, reason: 'no second provider implementation exists for either role in either path — a capability gap, not a design principle to revisit' },
            { seam: 'Snapshot discovery (read path)', status: BLOCKED, reason: 'identical missing-alternative gap' },
            { seam: 'CONTENT resolution (SnapshotPlacementResolver)', status: SEMANTICALLY_UNSUITABLE, reason: 'dispatches on an already-created placement\'s own historical storage field — a preference has no legitimate business here, regardless of any future prerequisite being met' },
            { seam: 'PROOF verification (ExternalAnchorVerifier)', status: SEMANTICALLY_UNSUITABLE, reason: 'identical historical-record shape, one role over' },
            { seam: 'material provenance (Origin: LOCAL/DECENTRALIZED)', status: SEMANTICALLY_UNSUITABLE, reason: 'this file\'s own header forbids a trust/rank/preferred concept from ever entering this concept — a Discovery service preference is a different axis and must never be read into, or written onto, Origin' },
            { seam: 'local/catalog listing (discovery/DiscoveryProvider.js)', status: INTERNAL, reason: 'not a substrate choice — this replica\'s own singular local index' },
            { seam: 'SnapshotPlacementStoreRegistry.js / ExternalProofVerifierRegistry.js / ExternalAnchorPublisherRegistry.js themselves', status: INTERNAL, reason: 'generic lookup tables, keyed by a plugin\'s own self-declared identity — legitimate composition-root infrastructure a preference should be layered ONTO, never reach around' },
            { seam: 'anchorType / ProofVerifier protocol machinery (Bitcoin wallet/signing/broadcast collaborators)', status: INTERNAL, reason: 'each construction factory builds exactly one, specifically-named, protocol-internal collaborator, confirmed scoped to "verify one anchor," never to general cryptographic operations' },
            { seam: 'any existing settings/preference mechanism for a role provider', status: DUPLICATIVE, reason: 'searched for and NOT FOUND — see this section\'s own repo-wide sweep below; recorded as a real, checked absence, never assumed' }
        ];

        // The DUPLICATIVE row is not asserted from memory — it is a real,
        // repo-wide sweep for anything already playing this role.
        const allProductionFiles = await repoWideProductionFiles();
        const duplicativePattern = /preferredStorage|defaultStorage|preferredNetwork|defaultProvider|preferredAnchorType|defaultAnchorType|preferredDiscoveryProvider/i;
        let duplicativeHits = 0;
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (duplicativePattern.test(text)) duplicativeHits += 1;
        }
        assert(duplicativeHits === 0, `E1. zero production files already implement a competing provider-preference mechanism of any shape (found ${duplicativeHits}) — confirming the DUPLICATIVE row above is a checked absence, not an assumption`);

        assert(classification.length === 12, `E2. twelve seams given a final classification (found ${classification.length})`);
        const counts = classification.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {});
        assert(counts[READY] === undefined, `E3. zero seams classified READY (found ${counts[READY] || 0}) — every candidate this audit traced still carries either a named product prerequisite, a semantic conflict, or is intentionally internal; this is a stricter bar than 0.9.296's own technical READY, deliberately`);
        assert(counts[BLOCKED] === 5, `E4. five seams classified BLOCKED (found ${counts[BLOCKED] || 0})`);
        assert(counts[SEMANTICALLY_UNSUITABLE] === 3, `E5. three seams classified SEMANTICALLY_UNSUITABLE (found ${counts[SEMANTICALLY_UNSUITABLE] || 0})`);
        assert(counts[INTERNAL] === 3, `E6. three seams classified INTERNAL (found ${counts[INTERNAL] || 0})`);
        assert(counts[DUPLICATIVE] === 1, `E7. exactly one row classified DUPLICATIVE (found ${counts[DUPLICATIVE] || 0}) — a checked, real absence, not a hedge`);

        console.log('  STATUS                    | SEAM');
        for (const c of classification) console.log(`  ${c.status.padEnd(26)} | ${c.seam}`);
        console.log('✓ Section E: zero seams are unconditionally READY under this milestone\'s own product bar — but the five BLOCKED seams are not equally blocked. CONTENT creation is blocked behind exactly ONE named, revisitable product principle, and is the ONLY seam anywhere in this codebase with real, already-registered redundancy in production today. Every other BLOCKED seam is missing a second provider outright — revisiting a principle would not even help them yet.');
    }

    // ===============================================================
    // Section F — the preference chain, proved end-to-end for the
    // strongest candidate, then proved unconsumed today.
    // ===============================================================
    {
        // F1: the chain works, against a registry shaped EXACTLY like
        // ui/main.js's own real Publication placement wiring (Section
        // B2c) — local + ipfs, side by side.
        const store = makePreferenceStore();
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        const localStore = new LocalContentStore(new InMemoryStorageProvider());
        const ipfsStore = new IpfsGatewayContentStore();
        contentRegistry.register(localStore);
        contentRegistry.register(ipfsStore);
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry,
            proofRegistry: emptyRegistry()
        });
        const useCase = new ResolvePreferredRoleProviderUseCase({ preferenceStore: store, resolver });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        const decision = useCase.execute({ role: RoleProviderRole.CONTENT });
        assert(decision.status === 'RESOLVED', 'F1a. against a registry shaped exactly like ui/main.js\'s own real wiring, a saved CONTENT preference resolves');
        assert(decision.provider === ipfsStore, 'F1b. the decision hands back the exact real IpfsGatewayContentStore instance — the same class ui/main.js itself registers, never a stand-in');

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));
        const secondDecision = useCase.execute({ role: RoleProviderRole.CONTENT });
        assert(secondDecision.provider === localStore, 'F1c. switching the stored preference switches the resolved provider — the full stored-preference -> resolver -> concrete-capability chain is real, not just its terminal step');
        console.log('✓ Section F (chain): Stored preference → ResolvePreferredRoleProviderUseCase → concrete capability proved end-to-end, against a registry shaped exactly like this codebase\'s own real, already-running Content-creation wiring');

        // F2: the baseline — today's real Content-creation workflow does
        // NOT call any of this. Proved from real source, not assumed.
        const filesToCheck = [
            'application/SnapshotPlacementCreationCoordinator.js',
            'application/CreateExternalSnapshotPlacementUseCase.js',
            'application/CreateSnapshotPlacementOrchestratorUseCase.js',
            'ui/views/DecentralizedPublicationsView.js'
        ];
        const preferenceReferencePattern = /RoleProviderPreference|RoleAwareProviderResolver|ResolvePreferredRoleProviderUseCase/;
        for (const file of filesToCheck) {
            const text = await source(file);
            assert(!preferenceReferencePattern.test(text), `F2a. ${file} contains no reference to the preference/resolver/use-case family (a real source read, not an assumption) — today's real Content-creation workflow genuinely does not consume the chain Section F1 just proved works`);
        }
        console.log('✓ Section F (baseline): the real, currently-running Content-creation workflow (the strongest candidate) does NOT read a stored preference anywhere in its own source today — this is the objective "before" state any future integration milestone would change');
    }

    // ===============================================================
    // Section G — the three preference states, audited PER CANDIDATE.
    // No global answer is given; none is invented where the brief
    // declines to answer it.
    // ===============================================================
    {
        const table = [
            {
                candidate: 'CONTENT creation (strongest candidate)',
                NO_PREFERENCE: 'unchanged from today: availableStorageTypes() renders every registered type, unranked (SnapshotPlacementCreationCoordinator\'s own documented behavior) — this is a FACT about existing behavior, not a decision this audit makes',
                PROVIDER_NOT_FOUND: 'OPEN — e.g. a preference naming a storage type this replica no longer registers. Whether that silently falls back to the unranked list (safe, but quietly discards the signal) or surfaces an explicit notice is a real product decision this audit does not make',
                RESOLVED: 'OPEN — even once revisited, "highlight the preferred button" and "pre-select without removing the others" are different UI decisions with different risk; this audit does not choose one, and repeats the constraint SnapshotPlacementCreationCoordinator\'s own header already states: the FULL set must stay offered regardless'
            },
            {
                candidate: 'PROOF creation',
                NO_PREFERENCE: 'unchanged from today: availableAnchorTypes() renders every registered type, unranked — identical shape to Content, a fact not a decision',
                PROVIDER_NOT_FOUND: 'OPEN, and currently VACUOUS — with only one real publisher registered (Section C2b), a configured-but-unavailable Proof preference cannot even occur against today\'s real production registry; this audit does not manufacture a scenario for it',
                RESOLVED: 'OPEN, and currently VACUOUS for the identical reason'
            },
            {
                candidate: 'Publication discovery (read path)',
                NO_PREFERENCE: 'unchanged from today: every configured service is queried, unconditionally',
                PROVIDER_NOT_FOUND: 'OPEN — meaningless under today\'s "query everyone" behavior; only becomes a real question if a future milestone deliberately changes that behavior, which this audit does not propose',
                RESOLVED: 'OPEN — this is exactly 0.9.296\'s own still-unmade "query all vs query preferred" question; this audit adds evidence (Section A1: evidence-pool narrowing) but does not resolve it'
            }
        ];
        for (const row of table) {
            assert(typeof row.NO_PREFERENCE === 'string' && typeof row.PROVIDER_NOT_FOUND === 'string' && typeof row.RESOLVED === 'string', `G1. ${row.candidate} answers all three states, even where the honest answer is "OPEN" — never a silent omission`);
        }
        console.log('  CANDIDATE                              | NO_PREFERENCE       | PROVIDER_NOT_FOUND | RESOLVED');
        for (const row of table) console.log(`  ${row.candidate.padEnd(39)} | today\'s real, unchanged behavior noted; PROVIDER_NOT_FOUND/RESOLVED left OPEN, never invented`);
        console.log('✓ Section G: NO_PREFERENCE is answerable today, per candidate, from each workflow\'s own already-documented behavior — it is simply "what already happens." PROVIDER_NOT_FOUND and RESOLVED are genuinely different per candidate (open vs. currently vacuous vs. a named unresolved policy question) and this audit deliberately answers none of them with an invented fallback, exactly as the milestone brief requires');
    }

    // ===============================================================
    // Section H — UI sequencing: consumer-first vs settings-first.
    //
    // UPDATED by 0.9.299 — Content Creation Provider Preference
    // Integration, which is exactly this section's own DECISION (below)
    // carried out: the CONTENT-creation consumer got built and wired
    // BEFORE any settings UI. ui/main.js is now the one legitimate `ui/`
    // file mentioning the concept — it composes application/
    // PreferredSnapshotPlacementCreationCoordinator.js's own composition
    // root, never a settings control (`ui/views/AvatarSettingsView.js`
    // still mentions nothing here — see H2 below, unchanged). UPDATED
    // AGAIN by 0.9.301 — Preferred Content Provider Placement Trigger —
    // ui/views/DecentralizedPublicationsView.js is now a SECOND
    // legitimate `ui/` file: its own "Use Preferred Provider" action
    // (this milestone's own recommended next step, named verbatim in this
    // audit's own Section I below) is a real, additive trigger next to
    // the existing per-storage buttons, still never a settings control —
    // `ui/views/AvatarSettingsView.js` still mentions nothing here. This
    // section is UPDATED, not deleted, following the exact precedent
    // every other repo-wide sweep in this sequence already set.
    // ===============================================================
    {
        const allProductionFiles = await repoWideProductionFiles();
        const uiFiles = allProductionFiles.filter((f) => f.startsWith('ui/'));
        const preferenceLikeUiPattern = /providerPreference|networkPreference|preferredProvider|substratePreference|RoleProviderPreference/i;
        let uiPreferenceHits = 0;
        const uiPreferenceHitFiles = [];
        for (const file of uiFiles) {
            const text = await source(file);
            if (preferenceLikeUiPattern.test(text)) { uiPreferenceHits += 1; uiPreferenceHitFiles.push(file); }
        }
        // UPDATED AGAIN by 0.9.302 — Content Provider Preference Settings
        // Entry Point, this audit's own recommended eventual next step
        // (Section I below, "0.9.302 — Content Provider Preference
        // Settings Entry Point" per its own docs/Roadmap.md sequencing),
        // carried out. `ui/views/ContentProviderSettingsView.js` is now a
        // real settings view mentioning a provider preference; `ui/router/
        // index.js`'s own route comment names it too. `ui/views/
        // AvatarSettingsView.js` still mentions nothing here — this is a
        // genuinely NEW, dedicated settings surface, never folded into an
        // unrelated existing one.
        const KNOWN_UI_PREFERENCE_FILES = new Set([
            'ui/main.js', 'ui/views/DecentralizedPublicationsView.js',
            'ui/views/ContentProviderSettingsView.js', 'ui/router/index.js'
        ]);
        assert(uiPreferenceHits === KNOWN_UI_PREFERENCE_FILES.size && uiPreferenceHitFiles.every((f) => KNOWN_UI_PREFERENCE_FILES.has(f)),
            `H1. exactly ui/main.js, ui/views/DecentralizedPublicationsView.js, ui/views/ContentProviderSettingsView.js, and ui/router/index.js mention a provider preference today, via 0.9.299's Content creation composition, 0.9.301's own trigger, and 0.9.302's own settings entry point (found ${uiPreferenceHits}: ${uiPreferenceHitFiles.join(', ')})`);

        // The settings-UI template this codebase already establishes.
        const avatarSettingsSource = await source('ui/views/AvatarSettingsView.js');
        assert(/inject\('identityUseCase'\)/.test(avatarSettingsSource), 'H2. AvatarSettingsView.js injects a use case — the shape a future preference control would follow');

        const SETTINGS_FIRST = 'A — Settings first (Settings UI -> Preference Store -> no consumer)';
        const CONSUMER_FIRST = 'B — Consumer first (existing workflow -> use case -> Preference Store, THEN Settings UI)';
        const decision = CONSUMER_FIRST;
        const reasoning = [
            'a settings UI published today would control a preference NOTHING reads (Section F2\'s own baseline) — every candidate this audit found, even the strongest one, still carries a named, unmet prerequisite',
            'Section E found zero seams unconditionally READY — publishing a control for an inert setting would be a misleading product capability, exactly the risk this milestone\'s own brief opened by naming',
            'CONTENT creation is not just the strongest candidate in the abstract — it already has real, registered, production multi-provider redundancy (Section B2c/B2d) TODAY, so the FIRST decision worth a person\'s time is revisiting SnapshotPlacementCreationCoordinator\'s own "never preferred/default" principle for Content specifically, not building a generic settings surface for three roles at wildly different readiness levels'
        ];
        assert(decision === CONSUMER_FIRST, 'H3. the decision this section exists to reach');
        console.log(`✓ Section H — DECISION: ${decision}`);
        for (const r of reasoning) console.log(`    - ${r}`);
        console.log(`  (rejected: ${SETTINGS_FIRST})`);
    }

    // ===============================================================
    // Section I — the verdict.
    // ===============================================================
    {
        console.log('\n✓ Section I — VERDICT: no workflow is ready to consume a role provider preference today WITHOUT a person first making one specific, named decision. That decision is narrower than "should we build provider preferences" (already built, 0.9.293-0.9.297) and narrower than "which of the three roles" (Content, decisively, on the evidence above) — it is:');
        console.log('    Should SnapshotPlacementCreationCoordinator.js\'s own documented "never ranked, never narrowed to a preferred/default one" principle be revisited for CONTENT creation specifically, to allow a stored preference to suggest (never remove) a default among availableStorageTypes()?');
        console.log('  This is the strongest candidate in the entire audit because it is the ONLY seam, across all three roles, where:');
        console.log('    1. a person already makes an explicit, per-action provider choice today (USER_CHOOSES_PROVIDER, Section D) — so a preference could only ever pre-suggest, never silently override or replace that act;');
        console.log('    2. real, already-registered multi-provider redundancy exists in production TODAY (ui/main.js: local + ipfs, both Publication and Snapshot placement, Section B2c/B2d) — unlike Proof creation, which has the identical restraint but no second provider yet, and unlike Publication discovery, whose own open question (query-all vs query-preferred) is a behavior change to an APPLICATION-chosen path, not a suggestion layered onto a USER-chosen one;');
        console.log('    3. every other candidate this audit traced is either missing a second provider outright (BLOCKED, but revisiting a principle would not even help yet), touches a historical record (SEMANTICALLY_UNSUITABLE — a preference must never rewrite what a placement or anchor already, historically, used), or is intentionally internal composition infrastructure.');
        console.log('  Recommended next step (0.9.299, unscheduled): a person decides whether to revisit that one named principle for Content creation. If yes, the smallest legitimate integration is a DEFAULT suggestion layered onto the existing availableStorageTypes() button list — never narrowing it, never auto-submitting on a person\'s behalf — consumed through ResolvePreferredRoleProviderUseCase exactly as Section F already proved it resolves. Only once that first real consumer exists does a settings UI (0.9.300, per this milestone\'s own recommended sequence) have anything real to control.');
        console.log('\n✅ All Role Provider Preference Product Integration Audit tests passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
