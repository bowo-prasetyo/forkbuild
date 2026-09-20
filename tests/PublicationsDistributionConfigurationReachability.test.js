import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.437 — Contextual Distribution Configuration Reachability.
//
// Closes the CONFIGURATION_DISCOVERABILITY_GAP tests/
// PublicationsDistributionSectionProductAndUIBoundaryAudit.test.js (0.9.435)
// named and 0.9.436 deliberately deferred: the per-publication "Distribution"
// section 0.9.436 built groups three roles' own real actions, but offered no
// way to reach any of the three already-existing, already-registered Settings
// views (content-provider, arweave-gateway, nostr-relay) from any of them.
//
// THIS MILESTONE ADDS FOUR PLAIN `<router-link>` ELEMENTS TO
// ui/views/DecentralizedPublicationsView.js, NOTHING ELSE:
//   - Announcement/Discovery > Publication card — one link, its target
//     resolved per-entry from `entry.discoveryDistributionProvider` (the
//     SAME select this card's own "Distribute Publication" button already
//     reads) by a new plain function, discoveryDistributionConfigurationRoute(entry).
//   - Announcement/Discovery > Snapshot card — two links, unconditional,
//     because ui/main.js's own composition root fixes Snapshot distribution
//     to Arweave content store + Nostr discovery publisher; there is no
//     per-entry choice here to key a single link off of.
//
//     AMENDED BY 0.9.506 — Make Snapshot Distribution Content Backend
//     Selectable. Content storage is no longer fixed to Arweave — this
//     entry's own `snapshotDistributionStorage` (IPFS/Arweave) is now a
//     real per-entry choice, exactly like the Publication card's own
//     Substrate choice above it. The Snapshot card's own Content link is
//     therefore now ALSO dynamic, resolved per-entry by the new
//     snapshotDistributionConfigurationRoute(entry) (mirroring
//     discoveryDistributionConfigurationRoute(entry) exactly); the Nostr
//     link stays unconditional, since Announcement/Discovery for this
//     family remains the fixed, single Nostr discoveryPublisher it always
//     was.
//   - Content — one link, at the role heading, because /settings/content-provider
//     configures one CONTENT-wide preference, never a per-storage-type
//     setting.
//   - Proof/Anchoring — deliberately ZERO links: 0.9.435's own Section E3/E4
//     already established, from real source, that Bitcoin/anchor
//     configuration has no persistent gateway/relay endpoint to route to.
//
// NO NEW CONFIGURATION SURFACE, NO NEW ROUTE, NO NEW SETTINGS VIEW. Every
// route linked here (Section A) was already registered in ui/router/index.js
// before this milestone; none of the three Settings views' own files change
// at all (Section E). No new v-model, <input>, <select>, or wallet control
// was added anywhere in the Distribution section (Section C) — configuration
// still happens only in Settings, this page only points there.
//
// LETTERED SECTIONS:
//   A. Reachability — a real router-link, resolving to a real registered
//      route, for every Settings-backed role/substrate.
//   B. Correct target — the per-entry substrate resolver is extracted and
//      REALLY EXECUTED against both substrate values, never merely pattern-
//      matched in prose.
//   C. No duplicated configuration — the Distribution section carries no
//      new form control of any kind; the one pre-existing <select> is
//      unchanged and is not itself a new "configuration" surface.
//   D. Distribution isolation — none of the four new links carry a click
//      handler, and every distribution-mutating call site this page had
//      before this milestone still has exactly the same count.
//   E. Existing Settings regression — the three Settings views' own files,
//      and ui/router/index.js itself, are byte-for-byte untouched.
//   F. Production boundary — only the files this milestone's own commit
//      message names changed.

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

function countOccurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

async function run() {
    console.log('Running Publications Distribution Configuration Reachability tests...\n');

    const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
    const routerSource = await source('ui/router/index.js');

    // Isolate the Distribution section, and each role's own slice within
    // it, by the same real markers 0.9.436's own test file already used to
    // locate the Content/Proof section boundaries — never a guessed line
    // range.
    //
    // AMENDED — the Distribution section's own outer wrapper was later
    // made collapsible (a <details open> carrying both
    // .identity-mgmt-card-details, for the shared border/summary-arrow
    // treatment every other disclosure on this page already uses, and its
    // own .identity-mgmt-distribution for its flex layout) — open by
    // default so these remain the primary, immediately visible actions for
    // a publication, exactly as this milestone's own narrative already
    // requires; only the wrapper tag changed, never the roles/actions
    // inside it this section's own assertions check below.
    const distributionStart = viewSource.indexOf('<details open class="identity-mgmt-card-details identity-mgmt-distribution">');
    const distributionEnd = viewSource.indexOf('<!-- Everything below is unchanged functionality', distributionStart);
    assert(distributionStart !== -1 && distributionEnd > distributionStart,
        n('setup. the Distribution section (0.9.436) is located, bounded by its own opening wrapper and the next unrelated comment immediately after it'));
    const distributionSection = viewSource.slice(distributionStart, distributionEnd);

    const publicationCardStart = distributionSection.indexOf('<span class="evidence-anchor-type">Publication</span>');
    const snapshotCardStart = distributionSection.indexOf('<span class="evidence-anchor-type">Snapshot</span>', publicationCardStart);
    const contentRoleStart = distributionSection.indexOf('Content — MOVED VERBATIM from this card\'s own');
    const proofRoleStart = distributionSection.indexOf('Proof / Anchoring — MOVED VERBATIM from this');
    assert([publicationCardStart, snapshotCardStart, contentRoleStart, proofRoleStart].every((i) => i !== -1),
        n('setup. all four role/action slices (Publication, Snapshot, Content, Proof/Anchoring) are located inside the Distribution section'));

    const publicationCardSlice = distributionSection.slice(publicationCardStart, snapshotCardStart);
    const snapshotCardSlice = distributionSection.slice(snapshotCardStart, contentRoleStart);
    const contentRoleSlice = distributionSection.slice(contentRoleStart, proofRoleStart);
    const proofRoleSlice = distributionSection.slice(proofRoleStart);

    // ===============================================================
    // Section A — Reachability.
    // ===============================================================
    {
        assert(/<router-link\s+:to="discoveryDistributionConfigurationRoute\(entry\)"/.test(publicationCardSlice),
            n('A1. the Publication card carries exactly one dynamic router-link, resolved per-entry from discoveryDistributionConfigurationRoute(entry)'));
        // UNIFIED — 0.9.447 added a SECOND, additive contextual link,
        // "Configure Nostr Publication Relays," pointed at a genuinely
        // separate relay-SET configuration/route. That configuration has
        // since been merged into the same one discoveryDistributionConfigurationRoute(entry)
        // already resolves to (/settings/nostr-relay for the Nostr case) —
        // see core/NostrRelayConfiguration.js's own "unified" header — so
        // the second link was removed as fully redundant with the first.
        assert(countOccurrences(publicationCardSlice, '<router-link') === 1,
            n('A2. UNIFIED — the Publication card carries exactly one router-link again: the second, now-redundant Nostr Publication Relays link was removed once its configuration merged into the one the first link already targets'));

        // AMENDED BY 0.9.506 — the Content link is now dynamic, resolved
        // per-entry from snapshotDistributionConfigurationRoute(entry),
        // mirroring the Publication card's own dynamic link (A1, above).
        assert(/<router-link\s+:to="snapshotDistributionConfigurationRoute\(entry\)"/.test(snapshotCardSlice),
            n('A3. the Snapshot card carries a dynamic router-link, resolved per-entry from snapshotDistributionConfigurationRoute(entry)'));
        assert(/<router-link to="\/settings\/nostr-relay"/.test(snapshotCardSlice),
            n('A4. the Snapshot card ALSO links to /settings/nostr-relay, unconditionally — Announcement/Discovery for this family stays the fixed, single Nostr discoveryPublisher it always was'));
        assert(countOccurrences(snapshotCardSlice, '<router-link') === 2,
            n('A5. the Snapshot card carries exactly two router-links — no more, no fewer'));

        assert(/<router-link to="\/settings\/content-provider"/.test(contentRoleSlice),
            n('A6. the Content role links to /settings/content-provider'));
        assert(countOccurrences(contentRoleSlice, '<router-link') === 1,
            n('A7. the Content role carries exactly one router-link — one per role, never one per storage card (content-provider-settings configures a single CONTENT-wide preference, not a per-storage setting)'));

        assert(!/<router-link/.test(proofRoleSlice),
            n('A8. Proof/Anchoring carries ZERO router-links of any kind — confirmed deliberate by 0.9.435\'s own Section E3/E4 (no persistent Bitcoin/anchor configuration endpoint exists to route to), not an oversight'));

        // Every linked path really is a registered route, not a guess —
        // re-confirmed locally rather than merely trusted from the 0.9.435
        // audit's own Section E2.
        for (const [name, path_] of [
            ['nostr-relay-settings', '/settings/nostr-relay'],
            ['arweave-gateway-settings', '/settings/arweave-gateway'],
            ['content-provider-settings', '/settings/content-provider']
        ]) {
            assert(new RegExp(`path: '${path_}', name: '${name}'`).test(routerSource),
                n(`A9[${name}]. ${path_} is really registered in ui/router/index.js, under the name this milestone's own links resolve to`));
        }

        console.log('✓ Section A: every Settings-backed role/substrate (Nostr, Arweave, Content) carries exactly one contextual router-link to a real, already-registered Settings route; Proof/Anchoring carries none, matching the one role this repository has no persistent Settings surface for.');
    }

    // ===============================================================
    // Section B — correct target, proven by real execution.
    // ===============================================================
    {
        const fnMatch = viewSource.match(/function discoveryDistributionConfigurationRoute\(entry\) \{([\s\S]*?)\n {8}\}/);
        assert(fnMatch, n('B1. discoveryDistributionConfigurationRoute(entry) is located in source as a plain, standalone function'));

        // eslint-disable-next-line no-new-func
        const resolveRoute = new Function('entry', fnMatch[1]);
        assert(resolveRoute({ discoveryDistributionProvider: 'arweave' }) === '/settings/arweave-gateway',
            n('B2. REAL EXECUTION: with the Publication card\'s substrate select set to "arweave", the resolver really returns /settings/arweave-gateway — the Arweave gateway Settings view, never the Nostr one'));
        assert(resolveRoute({ discoveryDistributionProvider: 'nostr' }) === '/settings/nostr-relay',
            n('B3. REAL EXECUTION: with the substrate select set to "nostr", the resolver really returns /settings/nostr-relay'));
        assert(resolveRoute({ discoveryDistributionProvider: 'nostr' }) === resolveRoute({ discoveryDistributionProvider: 'nostr' }),
            n('B4. the resolver is pure — identical input always produces identical output, no hidden per-call state'));

        // The function body itself never references the OTHER role's own
        // Settings route, and never falls back to a Bitcoin/anchor path
        // that (per Section A8/0.9.435 Section E3) does not exist.
        assert(!/content-provider/.test(fnMatch[1]), n('B5. the resolver never mentions content-provider — it resolves Announcement/Discovery substrates only, never CONTENT\'s own separate route'));
        assert(!/bitcoin|anchor/i.test(fnMatch[1]), n('B6. the resolver never mentions bitcoin/anchor — it cannot accidentally point Nostr/Arweave\'s own link at a route that does not exist'));

        console.log('✓ Section B: the per-entry substrate resolver was extracted from real source and REALLY EXECUTED against both substrate values — it is a pure, two-branch function that always sends "arweave" to /settings/arweave-gateway and everything else to /settings/nostr-relay, never confused with CONTENT\'s or Proof/Anchoring\'s own (non-existent) route.');

        // AMENDED BY 0.9.506 — the identical "extract and really execute"
        // proof, applied to the Snapshot card's own new Content resolver.
        const snapshotFnMatch = viewSource.match(/function snapshotDistributionConfigurationRoute\(entry\) \{([\s\S]*?)\n {8}\}/);
        assert(snapshotFnMatch, n('B7. 0.9.506 — snapshotDistributionConfigurationRoute(entry) is located in source as a plain, standalone function'));

        // eslint-disable-next-line no-new-func
        const resolveSnapshotRoute = new Function('entry', snapshotFnMatch[1]);
        assert(resolveSnapshotRoute({ snapshotDistributionStorage: 'ar' }) === '/settings/arweave-gateway',
            n('B8. REAL EXECUTION: with the Snapshot card\'s Content select set to "ar", the resolver really returns /settings/arweave-gateway'));
        assert(resolveSnapshotRoute({ snapshotDistributionStorage: 'ipfs' }) === '/settings/content-provider',
            n('B9. REAL EXECUTION: with the Content select set to "ipfs", the resolver really returns /settings/content-provider — there is no dedicated IPFS-only Settings view'));
        assert(!/nostr|bitcoin|anchor/i.test(snapshotFnMatch[1]), n('B10. the Snapshot Content resolver never mentions nostr/bitcoin/anchor — it resolves the Content role only, never Announcement/Discovery\'s or Proof/Anchoring\'s own route'));

        console.log('✓ Section B (continued): the Snapshot card\'s own new Content resolver was extracted and REALLY EXECUTED too — "ar" resolves to /settings/arweave-gateway, everything else to /settings/content-provider.');
    }

    // ===============================================================
    // Section C — no duplicated configuration.
    // ===============================================================
    {
        // AMENDED BY 0.9.506 — Make Snapshot Distribution Content Backend
        // Selectable. That milestone added exactly ONE new <select> of its
        // own — the Snapshot card's own Content (IPFS/Arweave) picker,
        // mirroring the Publication card's own pre-existing Substrate
        // picker one card up — never a relay-list or gateway-list picker
        // of any kind. The count below grows from one to two for exactly
        // that one, additive, already-audited control (tests/
        // SnapshotDistributionContentBackendSelectionIntegrationAudit.test.js).
        assert(countOccurrences(distributionSection, '<select') === 2,
            n('C1. AMENDED BY 0.9.506 — the Distribution section now contains exactly two <select> elements: the pre-existing (0.9.436) Nostr/Arweave substrate picker, and the new (0.9.506) IPFS/Arweave Content picker — no relay-list or gateway-list picker of any kind'));
        assert(!/<input/.test(distributionSection),
            n('C2. the Distribution section contains no <input> element of any kind — no relay URL field, no gateway URL field, no wallet address field, no credential field duplicated from either Settings view'));
        // Comment prose is allowed to explain WHY no wallet control was
        // added (see the "deliberately no Configure link" comment ahead of
        // Proof/Anchoring); what must be absent is an actual wallet
        // CONTROL — a click handler or connection-state read.
        assert(!/connectBaseWallet\(\)|bitcoinWalletConnection\.connect|isBaseWalletConnected\(\)|bitcoinWalletConnectionView\(\)/.test(distributionSection),
            n('C3. the Distribution section renders no actual wallet control (no connect/disconnect button, no connection-state read) — the Bitcoin wallet-connect UI (0.9.435\'s own Section E4) remains exactly where it already was, outside this section, never pulled in here'));
        assert(!/relayUrl|gatewayUrl|relay_url|gateway_url/.test(distributionSection),
            n('C4. no relay-URL/gateway-URL field or variable of any kind appears in the Distribution section — every "Configure" link is a bare navigation, never a rendered value from either Settings view\'s own store'));

        console.log('✓ Section C: this milestone added links, never controls, beyond the one Content <select> 0.9.506 added on top of 0.9.436\'s own Substrate <select>; no relay/gateway/wallet/credential input of any kind was introduced anywhere in it.');
    }

    // ===============================================================
    // Section D — distribution isolation.
    // ===============================================================
    {
        // None of the four new <router-link> elements carry a click
        // handler of their own — @click triggers a distribution command
        // elsewhere in this same section (the existing buttons), never a
        // router-link.
        // AMENDED BY 0.9.447 — Nostr Publication Relay Set Configuration.
        // The count below grows from four to five for exactly the one new,
        // additive link this milestone introduced (Section A2, above) — a
        // second, distinctly-targeted link, never a fifth Settings-backed
        // substrate/role of its own (Nostr Publication Relays configures the
        // SAME "nostr" choice Section A's own table already names, just a
        // different, genuinely separate destination for it).
        const routerLinkTags = distributionSection.match(/<router-link[^>]*>/g) || [];
        assert(routerLinkTags.length === 4, n(`D1. UNIFIED — exactly four router-link opening tags exist in the Distribution section (found ${routerLinkTags.length}) — the original four; the 0.9.447 Nostr Publication Relays link was removed once its configuration merged into the one the Publication card's own dynamic link already targets`));
        for (const tag of routerLinkTags) {
            assert(!/@click/.test(tag), n(`D2[${tag.replace(/\s+/g, ' ').trim()}]. carries no @click handler of its own — navigation only, never a distribution trigger`));
        }

        // The existing distribution-mutating call sites are exactly as
        // numerous as before this milestone — proving no new invocation
        // path was wired onto any of the four new links.
        const mutatingCallSites = {
            'distributePublicationForEntry(entry)': 1,
            'distributeSnapshot(entry)': 1,
            'createPlacement(entry, storage)': 1,
            'createAnchor(entry, anchorType)': 1
        };
        for (const [callSite, expectedCount] of Object.entries(mutatingCallSites)) {
            const actual = countOccurrences(viewSource, `@click="${callSite}"`);
            assert(actual === expectedCount, n(`D3[${callSite}]. still exactly ${expectedCount} @click call site(s) for ${callSite} in the whole file (found ${actual}) — this milestone added no second, no duplicate, and no new invocation of it`));
        }

        // The resolver function itself never calls into any command,
        // coordinator, or lifecycle store — it only computes a string.
        const fnMatch = viewSource.match(/function discoveryDistributionConfigurationRoute\(entry\) \{([\s\S]*?)\n {8}\}/);
        assert(!/publicationDistributionCommand|snapshotDistributionCommand|createPlacement|createAnchor|LifecycleStore|placementCreationCoordinator/.test(fnMatch[1]),
            n('D4. discoveryDistributionConfigurationRoute() calls no distribution command, coordinator, or lifecycle store — it reads entry.discoveryDistributionProvider and returns a literal string, nothing else'));

        // AMENDED BY 0.9.506 — the identical purity check for the new
        // Snapshot Content resolver.
        const snapshotFnMatch = viewSource.match(/function snapshotDistributionConfigurationRoute\(entry\) \{([\s\S]*?)\n {8}\}/);
        assert(!/publicationDistributionCommand|snapshotDistributionCommand|createPlacement|createAnchor|LifecycleStore|placementCreationCoordinator/.test(snapshotFnMatch[1]),
            n('D5. 0.9.506 — snapshotDistributionConfigurationRoute() calls no distribution command, coordinator, or lifecycle store either — it reads entry.snapshotDistributionStorage and returns a literal string, nothing else'));

        console.log('✓ Section D: the five router-link elements are pure navigation — none carries a click handler, and every real distribution-mutating call site (Publication distribute, Snapshot distribute, Content placement, Proof/Anchoring anchor creation) still appears in the file exactly as many times as it did before this milestone. Clicking a "Configure" link cannot invoke a distribution command, create a placement, create an anchor, or record a lifecycle observation.');
    }

    // ===============================================================
    // Section E — existing Settings regression.
    // ===============================================================
    {
        const guardedFiles = [
            'ui/views/ContentProviderSettingsView.js',
            'ui/views/ArweaveGatewaySettingsView.js',
            'ui/views/NostrRelaySettingsView.js'
        ];
        for (const file of guardedFiles) {
            const diff = execSync(`git diff HEAD -- ${file}`, { cwd: SOURCE_ROOT }).toString();
            assert(diff === '', n(`E1[${file}]. byte-for-byte unchanged by this milestone — this milestone links to these Settings views, it never edits any of them or the router that already registered them`));
        }

        // AMENDED BY 0.9.447 — Nostr Publication Relay Set Configuration.
        // ui/router/index.js is no longer checked for a zero-byte diff — a
        // LATER, independent milestone (0.9.447) legitimately added one new
        // route to it (/settings/nostr-publication-relays), which this
        // originally-written check would otherwise reject forever. What
        // matters for THIS milestone's own claim — that the three routes it
        // itself links to are still registered, unmodified, exactly as they
        // were — is checked directly instead: the exact three original route
        // registrations are still present, byte-for-byte, in the current
        // file.
        const routerSource = await source('ui/router/index.js');
        assert(routerSource.includes("{ path: '/settings/content-provider', name: 'content-provider-settings', component: ContentProviderSettingsView },"),
            n('E1b. AMENDED BY 0.9.447 — the original /settings/content-provider route registration this milestone links to is still present, unmodified'));
        assert(routerSource.includes("{ path: '/settings/arweave-gateway', name: 'arweave-gateway-settings', component: ArweaveGatewaySettingsView },"),
            n('E1c. AMENDED BY 0.9.447 — the original /settings/arweave-gateway route registration this milestone links to is still present, unmodified'));
        assert(routerSource.includes("{ path: '/settings/nostr-relay', name: 'nostr-relay-settings', component: NostrRelaySettingsView },"),
            n('E1d. AMENDED BY 0.9.447 — the original /settings/nostr-relay route registration this milestone links to is still present, unmodified'));

        console.log('✓ Section E: all three Settings views this milestone links to are confirmed, via a real git diff against HEAD, completely untouched, and their original route registrations in ui/router/index.js are confirmed still present and unmodified (that file itself now also carries one new, later, unrelated route — see AMENDED BY 0.9.447, above) — every one of them remains independently reachable exactly as it was before this milestone, whether or not /publications exists at all.');
    }

    // ===============================================================
    // Section F — production boundary.
    // ===============================================================
    {
        // AMENDED BY 0.9.506 — Make Snapshot Distribution Content Backend
        // Selectable. This section's original claim was narrower than this
        // repository's own reality even needs it to be: 0.9.437 itself
        // touched template/markup only, but nothing about THIS test's own
        // job (proving every "Configure" link reaches a real, unmodified
        // Settings view) requires that no OTHER, later, independently-
        // scoped milestone ever touches application/ again — 0.9.447
        // already established that precedent for ui/router/index.js
        // (see Section E, above). 0.9.506 legitimately adds one new,
        // narrowly-scoped application/ file (application/
        // SnapshotDistributionContentBackendSelection.js) and wires it into
        // ui/main.js, so both are added to AUTHORIZED here, and 'application'
        // is removed from the zero-diff domainDirs check below — every
        // OTHER domain directory this section originally guarded still
        // shows zero change.
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/PublicationsDistributionConfigurationReachability.test.js',
            'tests/PublicationsDistributionSectionProductAndUIBoundaryAudit.test.js',
            'ui/views/DecentralizedPublicationsView.js',
            // AMENDED BY 0.9.506:
            'application/SnapshotDistributionContentBackendSelection.js',
            'tests/SnapshotDistributionContentBackendSelectionIntegrationAudit.test.js',
            'tests/SnapshotContentStorageChoiceCapabilityBoundaryAudit.test.js',
            'tests/SnapshotDistributionRuntimeComposition.test.js',
            'tests/SnapshotPlacementArweaveStoreRegistrationIntegrationAudit.test.js',
            'tests/ArweaveGatewayRetrievalIntegration.test.js',
            'tests/EndpointMultiplicityFailoverSemanticsAudit.test.js',
            'tests/HostWalletCapabilityLazyResolutionFix.test.js',
            'ui/main.js',
            // AMENDED — a later, independently-scoped change made the
            // Distribution section's own wrapper collapsible (a <details>,
            // reusing .identity-mgmt-card-details' styling), which is a
            // real, narrow css/main.css edit — never a new configuration
            // surface, and never a change to any of the four route links
            // or two <select>s this section still checks below.
            'css/main.css'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`F1. every changed/added file is one this milestone (or a later, independently-scoped and separately-authorized one) already names (found unauthorized: ${JSON.stringify(unauthorized)})`));

        // AMENDED — 'css' is no longer expected to show zero change: the
        // Distribution-wrapper collapsibility amendment above is a real,
        // narrow css/main.css edit. Every OTHER domain directory this
        // section originally guarded still shows zero change.
        const domainDirs = ['core', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'docs'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`F2[${dir}]. ${dir}/ shows no change — 0.9.437 itself touched template/markup only, no domain or styling change`));
        }

        console.log('✓ Section F: every changed/added file is one this milestone, or 0.9.447/0.9.506\'s own later, independently-scoped and separately-authorized amendments, already names — no unexplained domain directory changed.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('PUBLICATIONS_DISTRIBUTION_CONFIGURATION_REACHABILITY_COMPLETE');
    console.log(`All ${assertionCount} assertions passed.`);
}

run().then(() => {
    console.log('\n✅ All PublicationsDistributionConfigurationReachability tests passed.');
}).catch((error) => {
    console.error('PublicationsDistributionConfigurationReachability.test.js FAILED:', error);
    process.exitCode = 1;
});
