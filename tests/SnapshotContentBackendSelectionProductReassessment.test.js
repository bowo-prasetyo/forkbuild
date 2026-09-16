import { readFile } from 'node:fs/promises';

// 0.9.509 — Snapshot Content Backend Selection Product Reassessment.
//
// Test-only, product-level audit. No production changes are made by this
// milestone itself — see the "UPDATE (0.9.510)" annotations below for the
// one narrow follow-up this audit's own Section I finding produced.
//
// 0.9.505-0.9.508 closed the TECHNICAL arc for Snapshot Content Backend
// Selection: Arweave and IPFS are both registered ContentStores (0.9.505),
// Distribution can select between them (0.9.506), the full journey was
// proven end to end with one real gap found (0.9.507), and that gap was
// closed (0.9.508). tests/SnapshotContentBackendSelectionEndToEndIntegrationAudit
// .test.js, tests/SnapshotDistributionContentBackendSelectionIntegrationAudit
// .test.js, and tests/SnapshotResolutionContentBackendRegistryIntegrationAudit
// .test.js already prove every one of those steps behaviorally, with real
// (non-mocked) collaborators. This milestone deliberately does NOT
// re-prove that machinery — Section A below regression-checks it by
// reading the real, current production source for the exact invariants
// those flagship audits already established, never by re-running their
// own in-memory network simulations a second time.
//
// What this milestone adds instead is the PRODUCT lens those technical
// audits never asked for: starting from a Snapshot publication, does an
// ordinary user's actual journey work, is the choice reachable, is it
// understandable, and does changing it leave everything else — Placement,
// Announcement/Discovery, the Arweave-default — exactly where it was.
//
//   PRODUCT_COMPLETE      — the choice is understandable, reachable,
//                           useful, and the complete journey works. Stop.
//   PRODUCT_GAP           — a concrete user-facing problem exists (the
//                           choice is unreachable, misleading, or
//                           otherwise fails an ordinary user). One
//                           narrowly scoped product milestone follows.
//   ARCHITECTURAL_GAP     — something genuinely prevents the promised
//                           user journey, not merely an interesting
//                           architectural possibility.
//
// Deliberately excluded, per this milestone's own brief: multi-backend
// publishing, replication, IPFS<->Arweave migration, automatic fallback,
// backend ranking, preferred-provider management, health monitoring,
// content mirroring, automatic re-publication, Local distribution,
// changing the Arweave default, a unified Content/Discovery provider
// selector, a new ContentStore abstraction, or any storage-provider
// infrastructure. None of that is implied by the completed architecture,
// and none of it is touched here.

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function run() {
    console.log('=== 0.9.509 — Snapshot Content Backend Selection Product Reassessment ===\n');

    // ===============================================================
    // Section A — prior technical arc, regression-checked as CLOSED.
    // Not re-proven; the three flagship audits already own that proof.
    // ===============================================================
    {
        const mainSource = await rawSource('ui/main.js');

        check(mainSource.includes('snapshotPlacementStoreRegistry.register(arweaveSnapshotPlacementContentStore);'),
            'A. 0.9.505 — Arweave remains registered as a real Snapshot Content Store, in production');
        check(/availableSnapshotDistributionStorageTypes\(snapshotPlacementStoreRegistry\)/.test(mainSource),
            'A. 0.9.506 — Distribution\'s eligible-backend read still comes from the shared registry, never a hardcoded pair');
        check(mainSource.includes("resolveSnapshotDistributionContentStore(snapshotPlacementStoreRegistry, storage)"),
            'A. 0.9.506 — Distribution still resolves its ContentStore by the CALLER-selected storage, never a fixed one');
        check(mainSource.includes('storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry'),
            'A. 0.9.508 — production\'s discoverSnapshotCommand/resolveSelectedSnapshotCommand still resolve through the shared registry (the 0.9.507 Section H gap stays closed)');
        check(!mainSource.includes('contentStore: snapshotRetrievalContentStore'),
            'A. 0.9.508 — the old fixed, Arweave-only resolution contentStore has not reappeared');

        for (const file of [
            'tests/SnapshotContentBackendSelectionEndToEndIntegrationAudit.test.js',
            'tests/SnapshotDistributionContentBackendSelectionIntegrationAudit.test.js',
            'tests/SnapshotResolutionContentBackendRegistryIntegrationAudit.test.js',
            'tests/SnapshotContentStorageChoiceCapabilityBoundaryAudit.test.js'
        ]) {
            const testsHtml = await rawSource('tests.html');
            check(testsHtml.includes(`./${file}`), `A. ${file} remains registered in tests.html — its own flagship proof still runs`);
        }

        console.log('✓ Section A: the 0.9.505-0.9.508 technical arc — Arweave registration, Distribution selection, and Resolution registry lookup — remains exactly as those milestones left it. Regression-checked from real production source, not re-run.');
    }

    // ===============================================================
    // Section B — the creation/distribution journey, from a Snapshot
    // publication: the choice exists, is exactly IPFS/Arweave, and is
    // reachable in the actual production topology (not merely provable
    // in an isolated test harness).
    // ===============================================================
    {
        const backendSelectionSource = await rawSource('application/SnapshotDistributionContentBackendSelection.js');
        check(/SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES\s*=\s*Object\.freeze\(\['ipfs',\s*'ar'\]\)/.test(backendSelectionSource),
            "B. the eligible Content backend set is exactly {IPFS, Arweave} — frozen, closed, no third option");

        const mainSource = await rawSource('ui/main.js');
        check(mainSource.includes('stores: [publicationContentStore, new IpfsContentStore()]'),
            'B. production registers a real IPFS store into the same registry Distribution reads from');
        check(mainSource.includes('snapshotPlacementStoreRegistry.register(arweaveSnapshotPlacementContentStore)'),
            'B. ...and a real Arweave store — both eligible backends are genuinely registered on a stock production build, not merely eligible-in-principle');

        const viewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        check(/const snapshotDistributionAvailableStorageTypesCommand = inject\('snapshotDistributionAvailableStorageTypes', null\)/.test(viewSource),
            'B. the picker\'s own option source is injected from the app-wide composition, never re-derived locally');
        check(/<select v-model="entry\.snapshotDistributionStorage" class="form-select"/.test(viewSource),
            'B. a real, bound <select> exists for the Content backend choice');
        check(/<option v-for="storage in snapshotDistributionStorageTypes" :key="storage" :value="storage">/.test(viewSource),
            'B. its options are rendered from the eligible-and-registered list, never a fixed pair of <option> tags');
        check(/v-if="snapshotDistributionStorageTypes\.length > 0"/.test(viewSource),
            'B. the picker degrades gracefully (hidden, not broken) when nothing is currently eligible, rather than offering a choice that cannot work');

        console.log('✓ Section B: starting from a Snapshot publication, a Content backend choice genuinely exists, is exactly {IPFS, Arweave}, and is reachable through a real, bound control fed by production\'s own registered stores.');
    }

    // ===============================================================
    // Section C — Announcement/Discovery independence. Content
    // selection (`entry.snapshotDistributionStorage`) and
    // Announcement/Discovery selection (`entry.discoveryDistributionProvider`)
    // are two separate fields on the same per-entry state object; neither
    // reads, writes, or derives from the other anywhere in this file. All
    // four combinations (IPFS/Nostr, IPFS/Arweave, Arweave/Nostr,
    // Arweave/Arweave) are already proven to resolve correctly, live,
    // by tests/SnapshotContentBackendSelectionEndToEndIntegrationAudit
    // .test.js's own Section I — this section confirms the STRUCTURAL
    // basis for that proof still holds in the real UI state shape.
    // ===============================================================
    {
        const viewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');

        check(/discoveryDistributionProvider:\s*'nostr',/.test(viewSource),
            "C. Announcement/Discovery's own per-entry field (discoveryDistributionProvider) exists, independent of Content");
        check(/snapshotDistributionStorage:\s*snapshotDistributionStorageTypes\[0\]\s*\|\|\s*'ar',/.test(viewSource),
            "C. Content's own per-entry field (snapshotDistributionStorage) exists, independent of Announcement/Discovery");

        const codeOnly = codeOnlyLines(viewSource).join('\n');
        check(!/discoveryDistributionProvider[^\n]*snapshotDistributionStorage|snapshotDistributionStorage[^\n]*discoveryDistributionProvider/.test(codeOnly),
            'C. neither field\'s own code ever appears on the same line as the other — no derivation, no shared setter, no coupling');
        check(!/watch\(\s*\(\)\s*=>\s*entry\.snapshotDistributionStorage/.test(codeOnly) && !/watch\(\s*\(\)\s*=>\s*entry\.discoveryDistributionProvider/.test(codeOnly),
            'C. neither field is watch()ed to drive the other — both stay two genuinely independent user choices');

        console.log('✓ Section C: Content backend selection and Announcement/Discovery substrate selection are two structurally independent fields; changing one leaves the other exactly where the user left it. Behavioral proof for all four Content x Discovery combinations already stands (0.9.507 Section I).');
    }

    // ===============================================================
    // Section D — end-to-end user-visible consequence: choose -> store
    // -> announce -> discover -> resolve -> the SELECTED backend is
    // actually used -> contentHash verifies. Already proven, twice,
    // flagship, live (0.9.507 Sections D/E, 0.9.508 Sections B/C) — this
    // section regression-checks that neither flagship proof was weakened
    // or narrowed since, rather than duplicating either.
    // ===============================================================
    {
        const e2eSource = await rawSource('tests/SnapshotContentBackendSelectionEndToEndIntegrationAudit.test.js');
        check(/FLAGSHIP \(IPFS\)/.test(e2eSource) && /select -> store -> locator -> contentHash -> announce -> discover -> resolve -> verify/.test(e2eSource),
            "D. 0.9.507's own full-journey IPFS flagship proof still exists, unweakened");
        check(/FLAGSHIP \(Arweave\)/.test(e2eSource),
            "D. ...and the identical Arweave flagship proof, one backend over");

        const resolutionSource = await rawSource('tests/SnapshotResolutionContentBackendRegistryIntegrationAudit.test.js');
        check(/FLAGSHIP: IPFS, through the exact new production shape/.test(resolutionSource),
            '0.9.508\'s own production-shaped IPFS resolution flagship proof still exists');
        check(/Arweave regression: the identical entry points/.test(resolutionSource),
            '...and its Arweave regression counterpart');

        console.log('✓ Section D: the complete user-visible journey — choose a backend, distribute, discover, resolve, verify — is proven live for both IPFS and Arweave, through production\'s own real entry points, and those proofs remain in force.');
    }

    // ===============================================================
    // Section E — configuration discoverability. Each backend's own
    // "Configure" link routes to that backend's own real settings
    // surface, never to the other backend's, and never to
    // Announcement/Discovery's own (separate) settings surface.
    // ===============================================================
    {
        const viewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');

        check(/function snapshotDistributionConfigurationRoute\(entry\) \{\s*\n\s*return entry\.snapshotDistributionStorage === 'ar'\s*\n\s*\? '\/settings\/arweave-gateway'\s*\n\s*: '\/settings\/content-provider';/.test(viewSource),
            "E. Content's own configuration route follows THIS entry's own selection: Arweave -> /settings/arweave-gateway, IPFS -> /settings/content-provider");
        check(/function discoveryDistributionConfigurationRoute\(entry\) \{\s*\n\s*return entry\.discoveryDistributionProvider === 'arweave'\s*\n\s*\? '\/settings\/arweave-gateway'\s*\n\s*: '\/settings\/nostr-relay';/.test(viewSource),
            'E. Announcement/Discovery\'s own configuration route is a SEPARATE function, keyed off its OWN field, never Content\'s');

        const routerSource = await rawSource('ui/router/index.js');
        for (const path of ['/settings/content-provider', '/settings/arweave-gateway', '/settings/nostr-relay']) {
            check(routerSource.includes(`path: '${path}'`), `E. real route ${path} exists in the router — no link points at a Settings surface that does not exist`);
        }

        check(/:to="snapshotDistributionConfigurationRoute\(entry\)"/.test(viewSource),
            "E. the Content card's own Configure link genuinely calls snapshotDistributionConfigurationRoute(entry), not a static href");

        console.log('✓ Section E: IPFS -> /settings/content-provider, Arweave -> /settings/arweave-gateway, and Announcement/Discovery keeps its own separate routing (Nostr/Arweave) — a person configuring Content is never sent to the Discovery settings surface, or vice versa.');
    }

    // ===============================================================
    // Section F — failure semantics stay narrow: a selected backend
    // that is unavailable fails; it is never silently substituted.
    // Already proven live (0.9.507 Section K, 0.9.508 Section H) —
    // regression-checked here at the source level.
    // ===============================================================
    {
        const backendSelectionSource = await rawSource('application/SnapshotDistributionContentBackendSelection.js');
        check(/throw new Error\(`resolveSnapshotDistributionContentStore: no ContentStore is currently registered for "\$\{storage\}"`\);/.test(backendSelectionSource),
            'F. an eligible-but-unregistered backend throws synchronously — no attempt to substitute a different, registered backend');

        const resolverSource = await rawSource('application/DecentralizedSnapshotResolver.js');
        check(resolverSource.includes('contentStore || (storeRegistry ? storeRegistry.get(candidate.storage) : null)'),
            "F. resolution still looks up EXACTLY the candidate's own declared storage — no ranking, no retry loop, no cross-backend fallback");

        console.log("✓ Section F: a selected backend's own unavailability is a failure, not a trigger to silently try the other backend — the user's explicit choice stays meaningful in both directions (select-time and resolve-time).");
    }

    // ===============================================================
    // Section G — Placement relationship. Local stays a real, usable
    // Placement backend; Distribution's own eligible set still excludes
    // it; registering Arweave for Placement never coupled it to
    // Distribution; and Distribution's own IPFS/Arweave choice touches
    // nothing about how Placement itself works.
    // ===============================================================
    {
        const backendSelectionSource = await rawSource('application/SnapshotDistributionContentBackendSelection.js');
        check(!backendSelectionSource.includes("'local'") || /never a legitimate Distribution target|SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES = Object\.freeze\(\['ipfs', 'ar'\]\)/.test(backendSelectionSource),
            "G. 'local' is documented and enforced as excluded from Distribution's own eligible set");

        const mainSource = await rawSource('ui/main.js');
        check(mainSource.includes('stores: [publicationContentStore, new IpfsContentStore()]'),
            "G. 'local' remains a genuinely registered, usable Placement backend (publicationContentStore, storage 'local')");

        check(!(await rawSource('application/SnapshotDistributionContentBackendSelection.js')).match(/CreateSnapshotPlacementOrchestratorUseCase|CreateExternalSnapshotPlacementUseCase/),
            'G. the Distribution selection module never imports any Placement creation class — no coupling introduced in that direction');
        const placementOrchestratorSource = await rawSource('application/CreateSnapshotPlacementOrchestratorUseCase.js');
        check(!/SnapshotDistributionContentBackendSelection|resolveSnapshotDistributionContentStore/.test(placementOrchestratorSource),
            "G. ...nor does Placement's own creation orchestrator import anything from Distribution's selection module, in the other direction");

        const viewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        check(/v-for="storage in availableStorageTypes"/.test(viewSource),
            "G. Placement's own picker (\"Create <X> Placement\") still reads its OWN, separately-scoped availableStorageTypes — not Distribution's snapshotDistributionStorageTypes");

        console.log("✓ Section G: Local remains usable for Placement and excluded from Distribution; the two registries/eligible-sets remain independently scoped, with zero import coupling in either direction; Distribution's own Content backend choice has no bearing on Placement semantics.");
    }

    // ===============================================================
    // Section H — existing-user compatibility. Arweave remains the
    // backward-compatible default, deliberately unchanged by this
    // milestone or any prior one in this arc.
    // ===============================================================
    {
        const mainSource = await rawSource('ui/main.js');
        check(/const snapshotDistributionCommand = \(bytes, storage = 'ar', publicationId, claimedPosition\)/.test(mainSource),
            "H. an omitted `storage` argument still defaults to 'ar' — every caller that has not been updated keeps its exact pre-0.9.506 Arweave-only behavior");

        const viewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        check(/snapshotDistributionStorage:\s*snapshotDistributionStorageTypes\[0\]\s*\|\|\s*'ar',/.test(viewSource),
            "H. the picker's own initial selection falls back to 'ar' only when nothing is currently eligible — 'ar' remains the one hardcoded fallback anywhere in this feature, never 'ipfs'");

        console.log("✓ Section H: Arweave remains the one backward-compatible default throughout — at the command layer (omitted storage) and at the UI layer (nothing eligible yet). Unchanged by this milestone, on purpose.");
    }

    // ===============================================================
    // Section I — THE most important product question: is "Content
    // backend" understandable to an ordinary user? Concretely: what
    // TEXT does the picker, and every other place a storage code is
    // displayed, actually render for 'ipfs' and 'ar'?
    //
    // ui/views/DecentralizedPublicationsView.js already carried the
    // right vocabulary at the time this milestone first ran — its own
    // Content card labels the FIELD "Content" (a meaningful word, not
    // "Content backend"), and its own Configure link already rendered
    // the literal words "Arweave"/"IPFS" via a manual ternary. But the
    // <option> text inside the SAME picker, the Placement role's own
    // per-backend card header, the "Create <X> Placement" button label,
    // and an already-created placement's own list-item header all
    // instead called humanizeContentKind(storage) — a function built
    // for content KINDS like 'forkbuild.structure' (-> 'Structure'),
    // applied there to a raw STORAGE CODE. For a real word like
    // 'structure' that produces a real word. For an ABBREVIATION like
    // 'ar' or 'ipfs' it did not: it title-cased the raw code and
    // stopped — 'ar' -> 'Ar', 'ipfs' -> 'Ipfs'. Neither was a word an
    // ordinary user would recognize as "Arweave" or "IPFS".
    //
    // UPDATE (0.9.510): CLOSED. Rather than reusing humanizeContentKind()
    // for a storage code at all, ui/views/DecentralizedPublicationsView
    // .js now carries a small, presentation-only humanizeStorageType(),
    // mirroring the existing precedent application/
    // RoleProviderPreferenceSettingsView.js's own PROVIDER_OPTION_LABELS
    // already established one role over: a known storage code renders
    // its real name ('ar' -> 'Arweave', 'ipfs' -> 'IPFS', 'local' ->
    // 'Local'); an unrecognized one still renders, falling back to
    // humanizeContentKind() rather than being hidden or refused. All
    // four call sites this section found now use it. This section is
    // left in place, reworded, as the historical record of the finding
    // 0.9.510 closed — regression-checked below as CLOSED, not merely
    // asserted.
    // ===============================================================
    {
        const viewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');

        check(/const STORAGE_TYPE_LABELS = \{\s*\n\s*local: 'Local',\s*\n\s*ipfs: 'IPFS',\s*\n\s*ar: 'Arweave'\s*\n\s*\};/.test(viewSource),
            "I. CLOSED — a real, closed name map exists: 'local' -> 'Local', 'ipfs' -> 'IPFS', 'ar' -> 'Arweave'");
        check(/function humanizeStorageType\(storage\) \{\s*\n\s*return STORAGE_TYPE_LABELS\[storage\] \|\| humanizeContentKind\(storage\);\s*\n\}/.test(viewSource),
            'I. CLOSED — humanizeStorageType() prefers the real name and only ever falls back to humanizeContentKind() for an unrecognized code, never the reverse');

        const closedStorageCallSites = [
            [/<option v-for="storage in snapshotDistributionStorageTypes" :key="storage" :value="storage">\{\{ humanizeStorageType\(storage\) \}\}<\/option>/, "the Distribution Content picker's own <option> text"],
            [/<span class="evidence-anchor-type">\{\{ humanizeStorageType\(storage\) \}\}<\/span>/, "the Placement role's own per-backend card header"],
            [/describePlacementCreationButtonLabel\(humanizeStorageType\(storage\), \{ creating:/, "the \"Create <X> Placement\" button's own label"],
            [/<span class="evidence-anchor-type">\{\{ humanizeStorageType\(placementView\.storage\) \}\}<\/span>/, "an already-created placement's own list-item header"]
        ];
        for (const [pattern, description] of closedStorageCallSites) {
            check(pattern.test(viewSource), `I. CLOSED — ${description} now renders through humanizeStorageType(), not humanizeContentKind()`);
        }
        // The only remaining `humanizeContentKind(storage)` text in the
        // whole file is humanizeStorageType()'s own internal fallback
        // (checked above) — a deliberate, named exception for an
        // unrecognized future storage code, never a leftover call site.
        const remainingDirectStorageCalls = (codeOnlyLines(viewSource).join('\n').match(/humanizeContentKind\(storage\)/g) || []).length;
        check(remainingDirectStorageCalls === 1,
            `I. CLOSED — exactly one humanizeContentKind(storage) remains in the file (found ${remainingDirectStorageCalls}): humanizeStorageType()'s own internal fallback, not a leftover call site`);
        check(!/humanizeContentKind\(placementView\.storage\)/.test(viewSource),
            'I. CLOSED — no remaining call site passes placementView.storage into humanizeContentKind()');

        // humanizeContentKind() itself is untouched and still exposed —
        // its own genuine remaining caller (content KIND) is a
        // deliberately separate axis from storage CODE and was never
        // broken; this regression-checks that this fix did not touch it.
        //
        // UPDATE (0.9.514): anchor TYPE moved off humanizeContentKind()
        // too, for the identical reason storage CODE did here — see
        // tests/ProofAnchoringProductCompletionReassessment.test.js's own
        // Section naming 'bitcoin-op-return' rendering as "Bitcoin Op
        // Return" (OP_RETURN is a raw Bitcoin script opcode, not a
        // network name) as its own PRODUCT_AMBIGUITY, closed the same
        // way this file's own Section I was: a small, presentation-only
        // humanizeAnchorType(), never a second, disconnected mechanism.
        // "This fix never widened beyond the four storage-code sites it
        // named" remains true of the 0.9.510 fix itself; anchor TYPE's
        // own, later, separately-scoped fix is what the assertions below
        // now check instead.
        check(/humanizeContentKind, humanizeStorageType, humanizeAnchorType, shortId/.test(viewSource),
            'I. humanizeContentKind is still exposed to the template, unmodified, alongside humanizeStorageType and (0.9.514) humanizeAnchorType');
        check(/\{\{ humanizeContentKind\(entry\.publication\.contentKind\) \}\}/.test(viewSource),
            "I. ...and still genuinely used for a real content KIND, exactly as before");
        check(/\{\{ humanizeAnchorType\(anchorType\) \}\}/.test(viewSource) && /\{\{ humanizeAnchorType\(anchorView\.anchorType\) \}\}/.test(viewSource),
            'I. (0.9.514) ...anchor TYPE now renders through humanizeAnchorType(), not humanizeContentKind() — see that milestone\'s own audit for why');
        check(!/\{\{ humanizeContentKind\(anchorType\) \}\}/.test(viewSource) && !/\{\{ humanizeContentKind\(anchorView\.anchorType\) \}\}/.test(viewSource),
            'I. (0.9.514) ...and no remaining call site passes anchorType/anchorView.anchorType into humanizeContentKind() directly');

        // The correct words were already known, elsewhere in this exact
        // same file, before this fix — the strongest evidence this was
        // always a narrow PRODUCT_GAP, never an ARCHITECTURAL_GAP.
        check(/Configure \{\{ entry\.snapshotDistributionStorage === 'ar' \? 'Arweave' : 'IPFS' \}\}/.test(viewSource),
            "I. the Configure link's own manual ternary — the vocabulary this fix's map now shares — is unchanged");
        check(/Distributes this replica's own locally held Snapshot bytes/.test(viewSource),
            'I. the Content card\'s own plain-language explanation of WHAT this choice does remains present');
        check(/<label v-if="snapshotDistributionStorageTypes\.length > 0" class="form-label">\s*\n\s*Content\s*\n/.test(viewSource),
            'I. the field is labeled the plain word "Content", not the architectural term "Content backend" — unchanged, no rename was needed');

        console.log("✓ Section I: CLOSED by 0.9.510. The Content backend picker's <option> text, the Placement role's per-backend card header, the \"Create <X> Placement\" button, and an already-created placement's list-item header all now render real names (\"Arweave\"/\"IPFS\"/\"Local\") via a small, presentation-only humanizeStorageType(), never a raw internal storage code. humanizeContentKind() itself, and its own genuine content-kind/anchor-type callers, are untouched.");
    }

    // ===============================================================
    // Section J — verdict.
    // ===============================================================
    console.log(`\n✅ All Snapshot Content Backend Selection Product Reassessment checks passed (${assertionCount} assertions).\n`);
    console.log('VERDICT: PRODUCT_COMPLETE (as of 0.9.510).');
    console.log('  Every question this milestone\'s own brief asked resolves PRODUCT_COMPLETE: the journey (Section B/D), Announcement/Discovery independence (Section C), configuration discoverability (Section E), failure semantics (Section F), the Placement relationship (Section G), the Arweave default (Section H), and — as of 0.9.510 — the Content backend labels themselves (Section I) are all reachable, understandable, correctly worded, and unchanged from their otherwise deliberately-chosen shape.');
    console.log('  0.9.509\'s own first run found exactly one PRODUCT_GAP: the Content backend picker\'s own <option> text, and three related storage-code displays on the same page, rendered raw internal codes (\'Ar\', \'Ipfs\') rather than the real words (\'Arweave\', \'IPFS\') an ordinary user would recognize. 0.9.510 closed it with a single, narrowly scoped presentation-only label lookup, reused at exactly those four call sites — nothing else touched, per this milestone\'s own exclusion list.');
    console.log('  Per this milestone\'s own brief: PRODUCT_COMPLETE means STOP. The Snapshot Content Backend Selection arc — 0.9.505 through 0.9.510 — is complete from the user\'s own perspective, not merely the architecture\'s.');
}

await run();
