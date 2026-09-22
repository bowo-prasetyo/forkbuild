import { readFile } from 'node:fs/promises';
import { sortOptionsByLabel, sortLabels, compareOptionLabels } from '../utils/sortOptionsByLabel.js';

// Choice lists are shown alphabetically unless their order carries meaning.
//
// This suite proves:
//   A. sortOptionsByLabel()/sortLabels() sort by visible label — case-,
//      accent-insensitive, numeric-aware, stable — and never mutate input.
//   B. every unordered picker renders through the helper (or, for a static
//      list, is written in alphabetical order), and display sorting never
//      reorders a list another piece of code relies on (first-entry
//      defaults, registry-order resolution).
//   C. the deliberate exceptions keep their meaningful order.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${assertionCount}. ${message}`);
}

function source(path) {
    return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function optionLabelsIn(select) {
    return [...select.matchAll(/<option[^>]*>([^<{]+)<\/option>/g)].map((m) => m[1].trim());
}

function isAlphabetical(labels) {
    return labels.every((label, i) => i === 0 || compareOptionLabels(labels[i - 1], label) <= 0);
}

async function run() {
    // Section A
    {
        const input = [{ label: 'Nostr' }, { label: 'arweave' }, { label: 'IPFS (Remote Pinning)' }, { label: 'IPFS (Local Kubo)' }];
        const before = JSON.stringify(input);
        const sorted = sortOptionsByLabel(input).map((o) => o.label);
        assert(JSON.stringify(sorted) === JSON.stringify(['arweave', 'IPFS (Local Kubo)', 'IPFS (Remote Pinning)', 'Nostr']),
            'options are sorted case-insensitively by label');
        assert(JSON.stringify(input) === before, 'the input array is never mutated');

        assert(JSON.stringify(sortLabels(['hair-10', 'hair-2', 'hair-01'])) === JSON.stringify(['hair-01', 'hair-2', 'hair-10']),
            'numeric runs compare numerically');
        assert(JSON.stringify(sortLabels(['scarf-01', 'glasses-01', 'hat-01', 'backpack-01'])) === JSON.stringify(['backpack-01', 'glasses-01', 'hat-01', 'scarf-01']),
            'plain string lists sort alphabetically');
        assert(compareOptionLabels('Éclair', 'eclair') === 0, 'accents and case are ignored');

        const ties = sortOptionsByLabel([{ label: 'B', id: 1 }, { label: 'a', id: 2 }, { label: 'b', id: 3 }]);
        assert(JSON.stringify(ties.map((o) => o.id)) === JSON.stringify([2, 1, 3]), 'equal labels keep their original order');

        const byCategory = sortOptionsByLabel([{ category: 'Walls' }, { category: 'Doors' }], (o) => o.category);
        assert(byCategory[0].category === 'Doors', 'a custom label accessor is honored');

        assert(Array.isArray(sortOptionsByLabel(null)) && sortOptionsByLabel(null).length === 0, 'a non-array degrades to []');
    }
    console.log('✓ Section A: sortOptionsByLabel() orders by visible label');

    // Section B
    {
        const substrateFiles = [
            'ui/components/WorldDistributionDialog.js',
            'ui/components/EditorDistributionDialog.js',
            'ui/components/PublicationCard.js',
            'ui/components/PublicationList.js',
            'ui/views/DecentralizedPublicationsView.js'
        ];
        for (const path of substrateFiles) {
            const text = await source(path);
            assert(!/<option value="nostr">Nostr<\/option>\s*<option value="arweave">Arweave<\/option>/.test(text),
                `${path} no longer lists Nostr before Arweave`);
            assert(/<option value="arweave">Arweave<\/option>\s*<option value="nostr">Nostr<\/option>/.test(text),
                `${path} lists the Announcement / Discovery substrates alphabetically`);
        }

        const editorDialog = await source('ui/components/EditorDistributionDialog.js');
        for (const select of editorDialog.match(/<select[\s\S]*?<\/select>/g)) {
            assert(isAlphabetical(optionLabelsIn(select)), `EditorDistributionDialog.js select is alphabetical: ${optionLabelsIn(select).join(', ')}`);
        }
        const worldDialog = await source('ui/components/WorldDistributionDialog.js');
        for (const select of worldDialog.match(/<select[\s\S]*?<\/select>/g)) {
            assert(isAlphabetical(optionLabelsIn(select)), `WorldDistributionDialog.js select is alphabetical: ${optionLabelsIn(select).join(', ')}`);
        }
        assert(/v-for="option in snapshotStorageOptions"/.test(worldDialog)
            && /snapshotStorageOptions\(\) \{\s*return sortOptionsByLabel\(/.test(worldDialog),
            'WorldDistributionDialog.js renders its snapshot storage choices through sortOptionsByLabel()');

        const publications = await source('ui/views/DecentralizedPublicationsView.js');
        assert(/snapshotDistributionStorageOptions = sortOptionsByLabel\(snapshotDistributionStorageTypes, humanizeStorageType\)/.test(publications)
            && /v-for="storage in snapshotDistributionStorageOptions"/.test(publications),
            'the Publication Center Content select is sorted by its displayed label');
        assert(/snapshotDistributionStorageTypes\[0\] \|\| 'ar'/.test(publications),
            'the first-entry fallback default still reads the unsorted registry-order list');
        assert(/return Object\.freeze\(sortOptionsByLabel\(\[\.\.\.bitcoinOptions, \.\.\.baseOptions\]\)\);/.test(publications),
            'publication pickers are sorted by label');
        assert(/return sortLabels\(reconstructDistinctPublisherIdentifiers\(/.test(publications),
            'publisher pickers are sorted');
        assert((publications.match(/<option v-for="peer in retrievalPeerOptions"/g) || []).length === 2
            && !/<option v-for="peer in retrievalPeers"/.test(publications),
            'both peer pickers render the sorted retrievalPeerOptions');
        assert(/const retrievalPeers = computed\(\(\) => peerSessionManager\.listPeers\(\)\s*\.filter\(/.test(publications),
            'retrievalPeers itself stays in registry order for resolution');

        const leaderboard = await source('ui/views/LeaderboardHubView.js');
        assert(/return sortLabels\(reconstructDistinctPublisherIdentifiers\(this\.archive\(\)\)\);/.test(leaderboard),
            'Leaderboard Hub publisher pickers are sorted');

        for (const path of ['ui/views/AnchorProviderSettingsView.js', 'ui/views/AnnouncementDiscoveryProviderSettingsView.js']) {
            const text = await source(path);
            assert(/const settings = computed\(\(\) => sortOptionsByLabel\(describeRoleProviderPreferenceSettings\(/.test(text),
                `${path} sorts its radio options after applying its own labels`);
        }
        const content = await source('ui/views/ContentProviderSettingsView.js');
        assert(/options: sortOptionsByLabel\(described\.options\)/.test(content), 'Content Provider radio options are sorted');

        const library = await source('ui/components/BuildLibraryPanel.js');
        assert(/sortOptionsByLabel\(options, \(option\) => option\.category\)/.test(library),
            'Build Library category filter is sorted');
        assert(/<option value="all">All/.test(library), '"All" stays first as its own static option');

        const avatar = await source('ui/views/AvatarSettingsView.js');
        assert(/sortOptionsByLabel\(wired\.templateRegistry\.getAll\(\), \(t\) => t\.displayLabel\)/.test(avatar),
            'avatar templates are sorted by display label');
        assert(/v-for="opt in componentOptions\(name\)"/.test(avatar) && /v-for="opt in componentOptions\('accessories'\)"/.test(avatar),
            'avatar component and accessory choices render through componentOptions()');
    }
    console.log('✓ Section B: unordered pickers are alphabetical, underlying lists are untouched');

    // Section C
    {
        const avatar = await source('ui/views/AvatarSettingsView.js');
        const visibilitySelects = avatar.match(/<select v-model="(?:profileV|v)isibility"[\s\S]*?<\/select>/g);
        for (const select of visibilitySelects) {
            assert(/PUBLIC[\s\S]*FRIENDS[\s\S]*LOCAL[\s\S]*HIDDEN/.test(select), 'presence visibility keeps its Public → Hidden scale');
        }
        const region = await source('ui/components/RegionFormModal.js');
        assert(/return Object\.values\(RegionKind\)\.map\(/.test(region) && !/sortOptionsByLabel/.test(region),
            'region kinds keep their Continent → Place scale');
        const license = await source('ui/components/MetadataEditorDialog.js');
        assert(!/sortOptionsByLabel/.test(license), 'licenses keep their most → least permissive order');
        const toolbar = await source('ui/components/PublicationCatalogToolbar.js');
        assert(/<option :value="groupOptions\.NONE">None<\/option>\s*<option :value="groupOptions\.AUTHOR">Author<\/option>\s*<option :value="groupOptions\.DATE">Date<\/option>\s*<option :value="groupOptions\.LICENSE">License<\/option>/.test(toolbar),
            'Group by: "None" first, then alphabetical');
        const chat = await source('ui/views/ChatView.js');
        assert(!/sortOptionsByLabel/.test(chat) && /<option value="">System default mic<\/option>/.test(chat),
            'audio devices keep the OS order with the system default first');
        const pairSelector = await source('ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js');
        assert(!/sortOptionsByLabel/.test(pairSelector), 'reconciliation record pools stay in their flat, unreordered order');
    }
    console.log('✓ Section C: ordered lists keep their deliberate order');

    console.log(`\n✅ All Sort Options By Label tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('SortOptionsByLabel.test.js FAILED:', error);
    process.exit(1);
});
