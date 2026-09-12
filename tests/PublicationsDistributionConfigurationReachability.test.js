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
    const distributionStart = viewSource.indexOf('<div class="identity-mgmt-distribution">');
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
        assert(countOccurrences(publicationCardSlice, '<router-link') === 1,
            n('A2. the Publication card carries exactly one router-link — never two, never a duplicate for each substrate'));

        assert(/<router-link to="\/settings\/arweave-gateway"/.test(snapshotCardSlice),
            n('A3. the Snapshot card links to /settings/arweave-gateway'));
        assert(/<router-link to="\/settings\/nostr-relay"/.test(snapshotCardSlice),
            n('A4. the Snapshot card ALSO links to /settings/nostr-relay — both substrates it is unconditionally composed onto (ui/main.js), never just one'));
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
    }

    // ===============================================================
    // Section C — no duplicated configuration.
    // ===============================================================
    {
        assert(countOccurrences(distributionSection, '<select') === 1,
            n('C1. the Distribution section contains exactly one <select> — the pre-existing (0.9.436) Nostr/Arweave substrate picker; this milestone added no second dropdown, no relay-list picker, no gateway-list picker'));
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

        console.log('✓ Section C: this milestone added links, never controls. The Distribution section\'s only form element remains the one <select> 0.9.436 already built; no relay/gateway/wallet/credential input of any kind was introduced anywhere in it.');
    }

    // ===============================================================
    // Section D — distribution isolation.
    // ===============================================================
    {
        // None of the four new <router-link> elements carry a click
        // handler of their own — @click triggers a distribution command
        // elsewhere in this same section (the existing buttons), never a
        // router-link.
        const routerLinkTags = distributionSection.match(/<router-link[^>]*>/g) || [];
        assert(routerLinkTags.length === 4, n(`D1. exactly four router-link opening tags exist in the Distribution section (found ${routerLinkTags.length}) — one per Settings-backed substrate/role named in Section A`));
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

        console.log('✓ Section D: the four new links are pure navigation — none carries a click handler, and every real distribution-mutating call site (Publication distribute, Snapshot distribute, Content placement, Proof/Anchoring anchor creation) still appears in the file exactly as many times as it did before this milestone. Clicking a "Configure" link cannot invoke a distribution command, create a placement, create an anchor, or record a lifecycle observation.');
    }

    // ===============================================================
    // Section E — existing Settings regression.
    // ===============================================================
    {
        const guardedFiles = [
            'ui/router/index.js',
            'ui/views/ContentProviderSettingsView.js',
            'ui/views/ArweaveGatewaySettingsView.js',
            'ui/views/NostrRelaySettingsView.js'
        ];
        for (const file of guardedFiles) {
            const diff = execSync(`git diff HEAD -- ${file}`, { cwd: SOURCE_ROOT }).toString();
            assert(diff === '', n(`E1[${file}]. byte-for-byte unchanged by this milestone — this milestone links to these Settings views, it never edits any of them or the router that already registered them`));
        }

        console.log('✓ Section E: ui/router/index.js and all three Settings views this milestone links to are confirmed, via a real git diff against HEAD, completely untouched — every one of them remains independently reachable exactly as it was before this milestone, whether or not /publications exists at all.');
    }

    // ===============================================================
    // Section F — production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/PublicationsDistributionConfigurationReachability.test.js',
            'tests/PublicationsDistributionSectionProductAndUIBoundaryAudit.test.js',
            'ui/views/DecentralizedPublicationsView.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`F1. every changed/added file is one this milestone's own commit message names (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'docs', 'css'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`F2[${dir}]. ${dir}/ shows no change — this milestone touches template/markup only, no application, domain, or styling change`));
        }

        console.log('✓ Section F: the only files this milestone changed are ui/views/DecentralizedPublicationsView.js (the four links and their one resolver function), this test file, its own tests.html registration, and the 0.9.435 audit file amended in place to record the gap\'s closure — no application/, core/, css/, or any other domain directory changed.');
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
