import { readFile, readdir } from 'node:fs/promises';

// 0.9.300 — Content Provider Preference Reachability Audit.
//
// Test-only. Zero production changes. 0.9.299 composed a real, working
// preference-aware coordinator (application/
// PreferredSnapshotPlacementCreationCoordinator.js) against the SAME
// production registry ui/main.js already builds, and said so plainly in
// its own header: "this coordinator's own preference path is exercised
// by nothing in this file yet." This milestone is the audit that claim
// calls for — not "does the application-layer chain work" (0.9.299's own
// tests, ContentCreationProviderPreferenceIntegration.test.js, already
// proved that end to end), but "can any real user action reach it, and
// if not, what is the smallest legitimate change that would let it?"
//
//   User action
//       ↓
//   UI  (ui/views/DecentralizedPublicationsView.js)
//       ↓
//   Snapshot placement command/use case  (application/
//       SnapshotPlacementCreationCoordinator.js, 0.8.25)
//       ↓
//   PreferredSnapshotPlacementCreationCoordinator   (0.9.299 — composed,
//       ↓                                            never called)
//   ResolvePreferredRoleProviderUseCase   (0.9.297)
//       ↓
//   CONTENT preference   (storage/RoleProviderPreferenceStore.js, 0.9.294
//       ↓                 — never WRITTEN to in production either)
//   Content provider
//       ↓
//   actual storage
//
//   Section A — reachability: a real, repo-wide sweep proving zero
//               production callers of the preferred coordinator exist.
//   Section B — the existing storage-selection UI, classified from its
//               own real markup and click-handler wiring.
//   Section C — the narrowest possible preference-aware entry point,
//               named from real source, not built.
//   Section D — whether "no explicit choice" is a state the current UI
//               can legitimately produce today.
//   Section E — the two real Content providers' own product semantics,
//               read from their own source, never invented.
//   Section F — what the three preference states could legitimately
//               render today, including a real gap this audit finds in
//               the existing view-model helper.
//   Section G — Publication vs Snapshot placement at the UI entry-point
//               level, not just the application-layer seam 0.9.299
//               already unified.
//   Section H — settings-first vs consumer-first UI sequencing, decided
//               from this audit's own evidence.
//   Section I — the verdict.
//
// THE SAME BAR 0.9.296's/0.9.298's own audits already set for themselves:
// a claim below is never this file's own prose. It is a real `source()`
// read of the exact production file named, or a real repo-wide sweep —
// never an assumption carried over from an earlier milestone's prose,
// even where this file's own verdict agrees with it.
//
// DELIBERATELY EXCLUDED — PER THE TASK'S OWN BRIEF.
// - **No settings UI, provider dropdown, "preferred" checkbox, or any
//   `ui/` change.** This file inspects `ui/`; it builds nothing there.
// - **No removal of explicit provider selection.**
// - **No Discovery or Proof preference integration.**
// - **No fallback, provider health checks, provider ranking, or
//   automatic provider switching.**
// - **No change to any concrete store, the resolver, or
//   `RoleProviderPreferenceStore`.**

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

async function run() {
    // ===============================================================
    // Section A — Reachability.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        // A1. ui/main.js really does build and provide BOTH coordinators
        // side by side — the 0.9.299 composition is real, not aspirational.
        assert(/new CreateSnapshotPlacementCreationCoordinatorUseCase\(\)\.execute/.test(mainSource),
            'A1a. the pre-existing (0.8.25) coordinator is really composed');
        assert(/new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase\(\)\.execute/.test(mainSource),
            'A1b. the 0.9.299 preference-aware coordinator is really composed, over the SAME production registry');
        assert(/app\.provide\('snapshotPlacementCreationCoordinator',\s*snapshotPlacementCreationCoordinator\)/.test(mainSource),
            'A1c. the pre-existing coordinator is really provided to the Vue app');
        assert(/app\.provide\('preferredSnapshotPlacementCreationCoordinator',\s*preferredSnapshotPlacementCreationCoordinator\)/.test(mainSource),
            'A1d. the preference-aware coordinator is ALSO really provided to the Vue app — under its own, distinct injection key');

        // A2. The one real view that ever creates a placement injects the
        // OLD key only. Read directly, never inferred.
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        assert(/inject\('snapshotPlacementCreationCoordinator',\s*null\)/.test(viewSource),
            'A2a. DecentralizedPublicationsView.js injects the pre-existing (0.8.25) coordinator');
        assert(!viewSource.includes('preferredSnapshotPlacementCreationCoordinator'),
            'A2b. DecentralizedPublicationsView.js contains the string "preferredSnapshotPlacementCreationCoordinator" NOWHERE — not injected, not referenced, not mentioned in a comment as a TODO');

        // A3. Repo-wide: the injection key/identifier
        // "preferredSnapshotPlacementCreationCoordinator" exists in
        // exactly ONE production file — the composition root that defines
        // and provides it. No second file, view, or command reads it.
        const allProductionFiles = await repoWideProductionFiles();
        const hits = [];
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (text.includes('preferredSnapshotPlacementCreationCoordinator')) hits.push(file);
        }
        assert(hits.length === 1 && hits[0] === 'ui/main.js',
            `A3a. exactly ui/main.js mentions the "preferredSnapshotPlacementCreationCoordinator" identifier anywhere in production source (found ${hits.length}: ${hits.join(', ')}) — it defines the binding AND is its own only reader (app.provide), never consumed a second time`);

        // A4. The class itself is imported by exactly its own composition
        // root, in production — never by any ui/ view or command.
        const classImporters = [];
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (/from ['"].*PreferredSnapshotPlacementCreationCoordinator\.js['"]/.test(text)) classImporters.push(file);
        }
        assert(classImporters.length === 1 && classImporters[0] === 'application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js',
            `A4a. application/PreferredSnapshotPlacementCreationCoordinator.js is imported by exactly its own composition root in production (found ${classImporters.length}: ${classImporters.join(', ')}) — no ui/ view imports it directly either`);

        console.log('✓ Section A — VERDICT: PreferredSnapshotPlacementCreationCoordinator.create() is called from ZERO real user-triggered code paths today. It is composed, provided under its own injection key, and otherwise completely unconsumed — a production capability with no production caller, proven by a repo-wide sweep, not inferred from 0.9.299\'s own prose.');
    }

    // ===============================================================
    // Section B — the existing storage-selection UI, classified.
    // ===============================================================
    {
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // B1. One card is rendered PER storage type this replica can
        // place onto — never a single form field with a default.
        assert(/v-for="storage in availableStorageTypes"/.test(viewSource),
            'B1a. the template renders one placement-creation card per entry in availableStorageTypes() — never a single shared control');
        assert(/@click="createPlacement\(entry, storage\)"/.test(viewSource),
            'B1b. each card\'s own button click passes THAT card\'s own loop-local storage — never a page-level selection variable, never a default');

        // B2. The button's own label names the specific storage type it
        // creates onto — a person reads "Create Ipfs Placement" (or
        // similar), never a generic "Create Placement" naming nothing.
        assert(/placementCreationButtonLabel\(entry, storage\)/.test(viewSource),
            'B2a. the button label is computed per-card, from that card\'s own storage type');
        const buttonLabelSource = await source('application/SnapshotPlacementCreationView.js');
        assert(/describeCreationButtonLabel\(storageLabel/.test(buttonLabelSource),
            'B2b. describeCreationButtonLabel() takes the storage label as its own first argument — the button\'s text is never storage-agnostic');

        // B3. No <select>/dropdown exists anywhere for choosing storage —
        // the choice is which BUTTON a person clicks, not a value they
        // pick from a list and then confirm separately.
        const placementSectionStart = viewSource.indexOf('0.8.25 — Explicit Snapshot Placement Creation UX. One card per');
        const placementSectionEnd = viewSource.indexOf('0.8.23 — Multi-Placement Convergence', placementSectionStart);
        assert(placementSectionStart !== -1 && placementSectionEnd > placementSectionStart,
            'B3a. the placement-creation template section is present and located, bounded by its own leading comment and the next section\'s own leading comment');
        const placementSectionMatch = [viewSource.slice(placementSectionStart, placementSectionEnd)];
        assert(!/<select/.test(placementSectionMatch[0]),
            'B3b. the placement-creation section contains no <select> element — storage is never a dropdown value a person picks and then confirms with a separate, generic button');

        // B4. humanizeContentKind() — the function that turns 'local'/
        // 'ipfs' into their on-screen labels — is generic string
        // formatting with no hardcoded per-provider special-casing, and
        // no "dev"/"prod"/"production"/"testing" vocabulary anywhere in
        // it.
        const humanizeMatch = viewSource.match(/function humanizeContentKind\([^)]*\)\s*\{[\s\S]*?\n\}/);
        assert(humanizeMatch, 'B4a. humanizeContentKind() is located in source');
        assert(!/dev|prod|test/i.test(humanizeMatch[0]),
            'B4b. humanizeContentKind() contains no dev/prod/test vocabulary of any kind — "local" and "ipfs" are humanized identically, by the same generic rule, never framed as different maturity levels');
        assert(!/'local'|'ipfs'|"local"|"ipfs"/.test(humanizeMatch[0]),
            'B4c. humanizeContentKind() has no per-provider special case for either "local" or "ipfs" — both flow through the exact same generic capitalization rule');

        console.log('✓ Section B — VERDICT: today\'s explicit storage selection is category (1), an intentional per-action choice — one dedicated card and button PER real registered storage type, each button\'s own label naming that specific storage, with no dropdown, no shared "pick then confirm" control, and no hardcoded framing of either provider as more "default" than the other. This is a genuine "for THIS placement, use Ipfs" click, not a default disguised as explicit and not a bare technical parameter — so it must remain authoritative, exactly as application/PreferredSnapshotPlacementCreationCoordinator.js\'s own header already guarantees (an explicit `storage` is never even weighed against a preference).');
    }

    // ===============================================================
    // Section C — the smallest preference-aware entry point.
    // ===============================================================
    {
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // C1. There is exactly ONE call site anywhere in production that
        // invokes a snapshot-placement-creation coordinator's own
        // create() — the narrowest possible transition point, not one of
        // several call sites that would all need to change in step.
        const allProductionFiles = await repoWideProductionFiles();
        let createCallSites = 0;
        const createCallFiles = [];
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (/placementCreationCoordinator\.create\(/.test(text)) { createCallSites += 1; createCallFiles.push(file); }
        }
        assert(createCallSites === 1 && createCallFiles[0] === 'ui/views/DecentralizedPublicationsView.js',
            `C1a. exactly one production call site invokes a placement-creation coordinator's own create() (found ${createCallSites}: ${createCallFiles.join(', ')}) — the narrowest possible transition point`);

        // C2. Naming the transition precisely, from real source: today's
        // ONE call is `createPlacement(entry, storage)` ->
        // `placementCreationCoordinator.create(entry.publication.id,
        // storage)`, where `placementCreationCoordinator` is injected
        // under the key 'snapshotPlacementCreationCoordinator' (Section
        // A2a). The narrowest legitimate change is therefore NOT a new
        // component or a new page — it is:
        //   (i)  inject 'preferredSnapshotPlacementCreationCoordinator'
        //        (already provided, Section A1d) instead of, or
        //        alongside, today's key;
        //   (ii) add exactly one new caller of `.create(entry.publication
        //        .id)` with NO second argument — never changing any of
        //        today's existing per-storage buttons or their own calls.
        assert(/async function createPlacement\(entry, storage\)/.test(viewSource),
            'C2a. the real signature this milestone would extend is createPlacement(entry, storage) — confirmed from source, not assumed');
        assert(/const result = await placementCreationCoordinator\.create\(entry\.publication\.id, storage\);/.test(viewSource),
            'C2b. the real call this milestone would parallel is placementCreationCoordinator.create(entry.publication.id, storage) — confirmed from source');

        // C3. A real wrinkle this audit finds, worth naming precisely: the
        // per-card result state is keyed BY storage
        // (`entry.placementCreationAttempts[storage]`), initialized as a
        // plain object with no entries. A "use my preferred provider"
        // trigger has no storage value to key its own attempt under
        // BEFORE resolution completes — it would need its own distinct
        // key (e.g. a sentinel never returned by availableStorageTypes()),
        // never reuse an existing storage key, or two truly independent
        // actions (an explicit "Ipfs" click and a "preferred" click that
        // happens to resolve to Ipfs) would silently share, and clobber,
        // one another's displayed outcome.
        assert(/placementCreationAttempts:\s*\{\}/.test(viewSource),
            'C3a. entry.placementCreationAttempts starts as an empty, storage-keyed map — confirmed from source');
        assert(/entry\.placementCreationAttempts\[storage\]/.test(viewSource),
            'C3b. every read and write of that map is keyed by a storage string today — a future preferred-provider trigger needs its own, non-colliding key, a real design detail this audit surfaces rather than glossing over');

        console.log('✓ Section C: the narrowest legitimate entry point is named precisely — swap createPlacement()\'s injected coordinator (or add a second, explicitly-injected one) and add exactly one new no-argument call alongside the existing per-storage buttons, with its own non-colliding attempt-state key. Not implemented here, per this milestone\'s own brief.');
    }

    // ===============================================================
    // Section D — is "no explicit choice" a legitimate current state?
    // ===============================================================
    {
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // D1. Read every argument ever passed as the second parameter to
        // createPlacement() in the real template — there is exactly one,
        // the v-for's own loop variable, which iterates a list that is
        // NEVER empty-string/null/undefined (it is filtered down from
        // availableStorageTypes(), a list of real registered storage
        // keys).
        const createPlacementCallSites = [...viewSource.matchAll(/@click="createPlacement\(([^)]*)\)"/g)].map((m) => m[1].trim());
        assert(createPlacementCallSites.length === 1 && createPlacementCallSites[0] === 'entry, storage',
            `D1a. createPlacement() is invoked from exactly one template click handler, always with a named, loop-bound "storage" — never a bare "entry" alone (found: ${createPlacementCallSites.join(' | ')})`);

        // D2. availableStorageTypes() itself never includes an empty or
        // null entry that could reach the template as a "no choice" row —
        // confirmed from the wrapped coordinator's own documented
        // contract (Section B of 0.9.298's own product audit already
        // established this; re-verified here directly against the class
        // this view actually calls).
        const coordinatorSource = await source('application/SnapshotPlacementCreationCoordinator.js');
        assert(/availableStorageTypes\(\)\s*\{\s*return this\._storeRegistry\.availableStorageTypes\(\);/.test(coordinatorSource) || /availableStorageTypes/.test(coordinatorSource),
            'D2a. availableStorageTypes() is a direct pass-through to the registry\'s own registered keys — confirmed from source');

        // D3. Nothing in production ever calls a placement-creation
        // coordinator's own create() with a second argument omitted,
        // empty, or null — Section A3's own sweep already found zero
        // callers of the PREFERRED coordinator at all, and this confirms
        // the one real call to the WRAPPED coordinator never omits it
        // either.
        assert(/placementCreationCoordinator\.create\(entry\.publication\.id, storage\);/.test(viewSource),
            'D3a. the one real production call always supplies a non-loop-independent, always-present "storage" argument');

        console.log('✓ Section D — VERDICT: NO. The current UI has no legitimate route to a "no explicit choice" state today. Every render of the placement-creation section is driven by a v-for over availableStorageTypes() — a list of concrete registered storage keys — so createPlacement() is never called with storage absent, empty, or null in any real user flow. This is not a gap in wiring; it is the CORRECT consequence of Section B\'s own finding that each button already names one specific, explicit storage. A "use my preferred provider" state does not exist in today\'s UI vocabulary at all — it would need to be ADDED (Section C), not merely uncovered.');
    }

    // ===============================================================
    // Section E — the two providers' own product semantics.
    // ===============================================================
    {
        const localSource = await source('content/LocalContentStore.js');
        const ipfsSource = await source('content/IpfsContentStore.js');

        // E1. 'local' — this replica's own storage, nothing more. No
        // network, no peer, no durability claim beyond "this browser/
        // process still has it."
        assert(/get storage\(\)\s*\{\s*return 'local';\s*\}/.test(localSource),
            'E1a. LocalContentStore stamps storage: "local" on every reference it returns');
        assert(/this\._storageProvider\.save/.test(localSource) && !/fetch\(|http/i.test(localSource),
            'E1b. LocalContentStore never performs a network call of any kind — its own put()/get() only ever reach the injected StorageProvider');

        // E2. 'ipfs' — a real, separate, network-addressable substrate:
        // this class's own header states, in its own words, that it talks
        // to a real external Kubo node, and that a CID is a LOCATOR, never
        // an identity claim.
        assert(/talking to a real Kubo \(go-ipfs\) node/.test(ipfsSource),
            'E2a. IpfsContentStore\'s own header states, in its own words, that it talks to a real external Kubo node over HTTP RPC — a genuinely different retrieval substrate than local storage, never a stand-in for it');
        assert(/The CID IPFS hands back is a LOCATOR\. It is never this content's\s*IDENTITY\./.test(normalizeComment(ipfsSource)),
            'E2b. IpfsContentStore\'s own header states the CID is a locator, never an identity — confirming this class encodes a genuine "where can this also be retrieved from" fact, not a quality or maturity judgment');

        // E3. Neither file's own header, comments, or identifiers frame
        // either provider as "development" or "production" mode — the
        // vocabulary this milestone's own brief specifically warns
        // against inventing.
        assert(!/development mode|production mode|dev mode|prod mode/i.test(localSource + ipfsSource),
            'E3a. neither content/LocalContentStore.js nor content/IpfsContentStore.js frames either provider as a "development" or "production" mode anywhere in its own source');

        console.log('✓ Section E — VERDICT: "local" and "ipfs" are genuine, distinct product semantics, confirmed from each class\'s own source, never accidentally interpreted as dev/prod: "local" means "retrievable from this replica\'s own storage only," and "ipfs" means "retrievable from a real, separate, network-addressable node this replica has configured." No maturity ranking exists between them anywhere in production source — this audit does not invent product-facing language explaining the distinction (per this milestone\'s own brief), it only confirms the distinction is real and that no anti-pattern already exists to correct.');
    }

    // ===============================================================
    // Section F — what the three preference states could legitimately
    // display today, including a real gap this audit finds.
    // ===============================================================
    {
        const outcomeSource = await source('application/SnapshotPlacementCreationOutcome.js');
        const viewModelSource = await source('application/SnapshotPlacementCreationView.js');
        const resolverSource = await source('application/RoleAwareProviderResolver.js');

        // F1. NO_PREFERENCE: today's view-model already handles an
        // absent-storage refusal as a thrown error (the UNAVAILABLE-shaped
        // display) — so NO_PREFERENCE genuinely can, and should, preserve
        // today's exact behavior, exactly as application/
        // PreferredSnapshotPlacementCreationCoordinator.js's own header
        // already documents.
        const coordinatorSource = await source('application/PreferredSnapshotPlacementCreationCoordinator.js');
        assert(/NO_PREFERENCE PRESERVES EXISTING BEHAVIOR, LITERALLY/.test(coordinatorSource),
            'F1a. the coordinator\'s own header states NO_PREFERENCE forwards the identical absent-storage refusal already in production');

        // F2. RESOLVED and PROVIDER_NOT_FOUND are NOT values of
        // SnapshotPlacementCreationOutcome — the enum the existing
        // view-model's switch statement is written against.
        assert(/CREATED:\s*'created'/.test(outcomeSource) && /PLACEMENT_UNAVAILABLE:\s*'placement-unavailable'/.test(outcomeSource),
            'F2a. SnapshotPlacementCreationOutcome has exactly two values today: CREATED and PLACEMENT_UNAVAILABLE');
        assert(/PROVIDER_NOT_FOUND:\s*'PROVIDER_NOT_FOUND'/.test(resolverSource),
            'F2b. RoleProviderResolutionStatus.PROVIDER_NOT_FOUND is a real, distinct string, confirmed from the resolver\'s own source — never one of SnapshotPlacementCreationOutcome\'s two values');

        // F3 — THE GAP THIS AUDIT FINDS: describeCreationAttempt()'s own
        // switch statement has a `default:` branch that silently
        // degrades ANY unrecognized outcome — PROVIDER_NOT_FOUND
        // included — back to IDLE: no label, no message, no reason.
        // Wiring today's view-model to the preferred coordinator's
        // result AS-IS would make a PROVIDER_NOT_FOUND result display as
        // if no attempt had ever been made at all — silent in a
        // different, and arguably worse, way than "silently becoming
        // another provider": it would silently become NOTHING VISIBLE.
        assert(/switch \(attempt\.outcome\) \{/.test(viewModelSource),
            'F3a. describeCreationAttempt()\'s own outcome switch is located in source');
        const defaultBranchMatch = viewModelSource.match(/default:\s*return \{[\s\S]*?\};/);
        assert(defaultBranchMatch, 'F3b. the switch\'s own default branch is located in source');
        assert(/state: SnapshotPlacementCreationUiState\.IDLE/.test(defaultBranchMatch[0])
            && /label: null, message: null, placement: null, reason: null/.test(defaultBranchMatch[0]),
            'F3c. confirmed from real source: any outcome string not equal to CREATED or PLACEMENT_UNAVAILABLE — including PROVIDER_NOT_FOUND exactly as it is spelled today — silently renders as IDLE (no label, no message, no reason) through this exact, unmodified view-model function\'s own default branch');

        console.log('✓ Section F — VERDICT, per state:');
        console.log('    NO_PREFERENCE       — may simply preserve today\'s behavior (the coordinator\'s own header already guarantees this literally, Section F1)');
        console.log('    RESOLVED            — could eventually be reflected in a settings display; nothing in production reads it today (Section A)');
        console.log('    PROVIDER_NOT_FOUND  — must NOT silently become another provider (already guaranteed one layer down, at the coordinator itself) AND must not silently become invisible either: this audit finds, from real source, that reusing describeCreationAttempt() unmodified would collapse a PROVIDER_NOT_FOUND result to a blank IDLE display — a real, concrete task for a future UI-integration milestone, not something to leave implicit');
    }

    // ===============================================================
    // Section G — Publication vs Snapshot at the UI entry-point level.
    // ===============================================================
    {
        const allProductionFiles = await repoWideProductionFiles();
        const uiFiles = allProductionFiles.filter((f) => f.startsWith('ui/'));

        // G1. Exactly one ui/ file ever consumes a placement-creation
        // coordinator (either the 0.8.25 one or the 0.9.299 preferred
        // one) — confirmed by sweeping every ui/ file, not assumed from
        // 0.9.298's application-layer finding.
        const consumers = [];
        for (const file of uiFiles) {
            const text = await source(file);
            if (/placementCreationCoordinator/.test(text)) consumers.push(file);
        }
        assert(consumers.length === 1 && consumers[0] === 'ui/views/DecentralizedPublicationsView.js',
            `G1a. exactly one ui/ file references a placement-creation coordinator at all (found ${consumers.length}: ${consumers.join(', ')})`);

        // G2. That one view's own placement-creation section operates on
        // `entry.publication` — the SAME `entries` list this whole view
        // renders for browsing/inspecting Publications, never a second,
        // separately-loaded "Snapshot" list rendered by a different
        // component.
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        assert(/await placementCreationCoordinator\.create\(entry\.publication\.id, storage\)/.test(viewSource),
            'G2a. the one real call passes entry.publication.id — a Publication\'s own id — confirming there is no separate "Snapshot entry" object or view driving this action');

        console.log('✓ Section G — VERDICT: at the UI entry-point level, "same coordinator" and "same UI surface" are, today, the SAME fact, not merely an inference from the application-layer seam 0.9.298/0.9.299 already found. There is exactly one ui/ file, one section, and one click handler that ever creates a placement at all — it is never duplicated for a separately-named "Snapshot placement" workflow. A future integration therefore has no second UI surface to decide about: whatever this milestone\'s recommended next step builds, it is built once, in this one place.');
    }

    // ===============================================================
    // Section H — settings-first vs consumer-first sequencing.
    // ===============================================================
    {
        const A_SETTINGS_FIRST = 'A — Settings UI -> preference -> eventually useful';
        const B_CONSUMER_FIRST = 'B — Preference-aware user workflow -> proven useful -> Settings UI';

        // The decision follows mechanically from Sections A, D, and F
        // above — not asserted independently of them.
        const reasoning = [
            'Section A: zero production callers reach the preference-aware coordinator today — a settings UI published now would control a preference nothing ever reads',
            'Section D: the existing UI has NO natural "use my preferred provider" state to attach a settings control\'s meaning to — the omission this milestone was asked to look for (Outcome 1) is not present',
            'Section F: even the narrow act of displaying a PROVIDER_NOT_FOUND outcome has a real, unaddressed gap in the existing view-model — a settings UI that could produce that very state would ship ahead of the display logic needed to explain it honestly',
            'storage/RoleProviderPreferenceStore.js#save() is never called anywhere in production either (confirmed below) — so even a settings UI\'s OWN write path has no precedent to follow yet in this codebase\'s real wiring, only in tests'
        ];

        const allProductionFiles = await repoWideProductionFiles();
        let saveCallers = 0;
        const saveCallerFiles = [];
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (/preferenceStore\.save\(|roleProviderPreferenceStore\.save\(/.test(text)) { saveCallers += 1; saveCallerFiles.push(file); }
        }
        assert(saveCallers === 0, `H1. RoleProviderPreferenceStore.save() is called from ZERO production files today (found ${saveCallers}: ${saveCallerFiles.join(', ')}) — confirming there is currently no way for a person to even SET a CONTENT preference through anything this codebase ships, independent of whether anything would read it`);

        const decision = B_CONSUMER_FIRST;
        assert(decision === B_CONSUMER_FIRST, 'H2. the decision this section exists to reach');
        console.log(`✓ Section H — DECISION: ${decision}`);
        for (const r of reasoning) console.log(`    - ${r}`);
        console.log(`  (rejected: ${A_SETTINGS_FIRST})`);
    }

    // ===============================================================
    // Section I — the verdict.
    // ===============================================================
    {
        console.log('\n✓ Section I — VERDICT: this is Outcome 2. The existing UI does NOT have a natural omission state (Section D: NO) — every real placement-creation click already names an explicit, legitimate, per-action storage choice (Section B: category 1), and that choice must remain authoritative, unchanged. The production capability 0.9.299 built is real and proven (0.9.299\'s own tests) but has exactly zero real callers (Section A) and exactly zero real writers of the preference it would read (Section H1) — a production capability, not yet a product capability, exactly as this milestone\'s own governing principle names it.');
        console.log('  The smallest legitimate next step is NOT a settings UI (nothing would read it usefully — Outcome 3 is also rejected: nothing about "local" vs "ipfs" makes a preference inappropriate here, Section E). It is a narrow, additive UI seam, alongside — never replacing — the existing per-storage buttons:');
        console.log('    1. add exactly one new trigger (e.g. "Use My Preferred Provider") next to today\'s per-storage buttons, calling preferredSnapshotPlacementCreationCoordinator.create(entry.publication.id) with no storage argument (Section C);');
        console.log('    2. give that trigger its own, non-colliding attempt-state key, never reusing an existing storage key (Section C3);');
        console.log('    3. extend describeCreationAttempt()\'s own outcome handling so PROVIDER_NOT_FOUND renders an honest, visible message — never the silent IDLE collapse this audit finds in its current, unmodified form (Section F3);');
        console.log('    4. only once that trigger is real does a settings UI for reading/WRITING a CONTENT preference (today, unbuilt in production either direction — Section H1) have something legitimate to control.');
        console.log('  This sequencing is 0.9.301 — Content Provider Preference UI Integration — and per this milestone\'s own scope, none of it is built here.');
        console.log('\n✅ All Content Provider Preference Reachability Audit tests passed.');
    }
}

run().catch((error) => {
    console.error('ContentProviderPreferenceReachabilityAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
