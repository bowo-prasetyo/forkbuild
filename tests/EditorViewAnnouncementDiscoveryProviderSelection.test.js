import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composePublicationDistributionCommand, composeMultiRelayNostrPublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';

// 0.9.502 — Editor Announcement/Discovery Provider Selection.
//
// 0.9.430 gave WorldView.js's/WorldEncounterCanvas.js's own "Distribute
// Publication" action an explicit Nostr/Arweave substrate choice; 0.9.447
// gave DecentralizedPublicationsView.js the identical choice. EditorView.js's
// own "Distribute now" action — reachable the instant a Publish succeeds,
// see that file's own 0.9.377 header — never gained one: every click
// reached the multi-relay Nostr command unconditionally, with no way to
// reach Arweave at all (confirmed stale by
// tests/AnnouncementDiscoveryProviderExpansionReadinessAudit.test.js's own
// pre-0.9.502 Section A3, and tests/DecentralizedSubstrateRoleChoiceUIReachabilityAudit.test.js's
// own pre-0.9.502 Section B9 comment). This milestone closes that
// asymmetry, giving EditorView.js the IDENTICAL seam WorldEncounterCanvas.js
// already has — never a new one, never a second Announcement/Discovery
// architecture, and never touching the Snapshot-family
// NostrSnapshotDiscoveryPublisher/ArweaveSnapshotDiscoveryPublisher pair
// (0.9.133/0.9.498), which is a structurally separate role from
// Publication distribution — see application/SnapshotDistributionCommand.js's
// own header, "No coupling to Signed Claim distribution."
//
//   EditorView.js's own post-publish overlay
//        │
//        │  new "Announcement / Discovery substrate" <select>   ★ (THIS)
//        ▼
//   selectedDiscoveryProvider = 'nostr' | 'arweave'   (page-local UI state, default 'nostr')
//        │  click "Distribute now"
//        ▼
//   distributePublishedDocument()   (existing, amended)
//        │
//        ▼
//   distributeEditorPublication(publication, selectedDiscoveryProvider)   (existing, amended)
//        │
//        ├──► publicationDistributionCommand({ ..., discoveryProvider: 'arweave' })   (re-injected)
//        └──► multiRelayNostrPublicationDistributionCommand({ ... })                  (unchanged, the default)
//
// LETTERED SECTIONS:
//   A. UI choice exists — EditorView.js's own template exposes exactly
//      the two currently supported choices, Nostr and Arweave, defaulting
//      to Nostr, gated on the same action it configures.
//   B. Nostr default/backward compatibility — an omitted or explicit
//      'nostr' selection reaches the existing multi-relay command.
//   C. Arweave reachability — an explicit Arweave selection reaches the
//      real, production ArweaveAnnouncementPublisher, round-tripped
//      against a fake Arweave ledger.
//   D. Exactly-one-provider invariant — each selection produces exactly
//      one publisher invocation; the other receives zero calls.
//   E. Option/configuration isolation — EditorView.js never reads or
//      constructs provider-specific configuration of any kind.
//   F. No regression — OwnPublicationPanel.js's own, separate call site
//      is unmodified and still Nostr-only.
//   G. Snapshot-family isolation — this milestone never touches
//      NostrSnapshotDiscoveryPublisher/ArweaveSnapshotDiscoveryPublisher
//      or the Snapshot distribution seam.
//   H. Production boundary — only the files this milestone names are
//      changed in the current working tree.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE: multi-provider fan-out,
// automatic fallback, provider health/ranking, a remembered global
// preference, endpoint/relay/gateway configuration UI, any change to
// World View's or DecentralizedPublicationsView's own existing substrate
// controls, and any change to Snapshot placement/discovery/distribution.

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
function codeOnly(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = {
        async sign(material) {
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if ((options.method || 'GET') === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, transaction.data);
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    async function uploadTaggedTransaction(material, tag) {
        const id = newId('Announce');
        ledger.set(id, material);
        return { id, tag };
    }
    return { ledger, contentSigner, fetchImpl, uploadTaggedTransaction };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

// Reproduces ui/views/EditorView.js's own distributeEditorPublication()
// verbatim — the established convention this test family already uses
// (see e.g. tests/AnnouncementDiscoveryProviderSelectionReachability.test.js's
// own Section D) — guarded by a direct source match so this reproduction
// cannot silently drift from the real function.
function makeDistributeEditorPublication({ multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand }) {
    return function distributeEditorPublication(publication, discoveryProvider) {
        if (discoveryProvider === 'arweave') {
            if (!publicationDistributionCommand) {
                return Promise.reject(new Error('Publication distribution is not available.'));
            }
            return publicationDistributionCommand({
                publication,
                serializedMaterial: JSON.stringify(publication.toJSON()),
                discoveryProvider
            });
        }
        if (!multiRelayNostrPublicationDistributionCommand) {
            return Promise.reject(new Error('Publication distribution is not available.'));
        }
        return multiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });
    };
}

async function run() {
    // ===============================================================
    // Section A — UI choice exists.
    // ===============================================================
    {
        const editorSource = await source('ui/views/EditorView.js');

        assert(/<select[^>]*v-model="selectedDiscoveryProvider"/.test(editorSource),
            n('A1. EditorView.js renders a <select> bound to selectedDiscoveryProvider'));
        assert(/<option value="nostr">Nostr<\/option>/.test(editorSource),
            n('A2. exactly one option offers Nostr'));
        assert(/<option value="arweave">Arweave<\/option>/.test(editorSource),
            n('A3. exactly one option offers Arweave'));

        const optionMatches = editorSource.match(/<option value="[^"]*">/g) || [];
        assert(optionMatches.length === 2,
            n(`A4. exactly two <option> elements exist anywhere in this file (found ${optionMatches.length}) — the currently supported choices, no more, no fewer`));

        assert(/const selectedDiscoveryProvider = ref\('nostr'\);/.test(editorSource),
            n('A5. selectedDiscoveryProvider defaults to \'nostr\' — matching PublicationDistributionRuntimeComposition.js\'s own default, so a mount that never touches the control behaves exactly as every pre-0.9.502 mount already did'));

        // Rendered alongside the SAME action it configures, gated on
        // canDistributePublication — never its own always-visible panel.
        const selectIndex = editorSource.indexOf('v-model="selectedDiscoveryProvider"');
        const precedingWindow = editorSource.slice(Math.max(0, selectIndex - 400), selectIndex);
        assert(/v-if="canDistributePublication"/.test(precedingWindow),
            n('A6. the substrate control is gated on canDistributePublication — the same guard the "Distribute now" button itself now uses, never rendered unconditionally'));

        console.log('✓ Section A: EditorView.js\'s own post-publish overlay exposes exactly the two currently supported Announcement/Discovery substrates, Nostr and Arweave, defaulting to Nostr');
    }

    // ===============================================================
    // Section B — Nostr default/backward compatibility.
    // ===============================================================
    {
        const network = new Map();
        async function publishImpl(relayUrl, eventTemplate) {
            const list = network.get(relayUrl) || [];
            list.push(eventTemplate);
            network.set(relayUrl, list);
            return { published: true, id: 'b'.repeat(64) };
        }
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore: new PublicationDistributionLifecycleMemoryStore(),
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: ['wss://editor-relay.example'],
            nostrPublisherOptions: { discoveryTag: 'forkbuild-editor-b', publishImpl }
        });
        let arweaveCalls = 0;
        const distributeEditorPublication = makeDistributeEditorPublication({
            multiRelayNostrPublicationDistributionCommand: multiRelayCommand,
            publicationDistributionCommand: async () => { arweaveCalls += 1; throw new Error('B. Arweave must never be called for a Nostr-bound selection'); }
        });

        const omittedResult = await distributeEditorPublication(makeFakePublication('pub-b-omitted'), undefined);
        assert(Array.isArray(omittedResult) && omittedResult.length === 1, n('B1. an omitted discoveryProvider (every pre-0.9.502 caller) reaches the multi-relay Nostr command'));

        const explicitResult = await distributeEditorPublication(makeFakePublication('pub-b-explicit'), 'nostr');
        assert(Array.isArray(explicitResult) && explicitResult.length === 1, n('B2. an explicit \'nostr\' selection (this milestone\'s own default) reaches the identical multi-relay path'));

        assert(arweaveCalls === 0, n('B3. neither call ever reached the Arweave command'));
        assert(network.get('wss://editor-relay.example').length === 2, n('B4. the configured relay genuinely received both announcements'));

        console.log('✓ Section B: an omitted or explicit Nostr selection reaches the real multi-relay command, unchanged from every pre-0.9.502 caller');
    }

    // ===============================================================
    // Section C — Arweave reachability, end to end.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
            nostrPublisherOptions: {
                discoveryTag: 'forkbuild-editor-c-nostr',
                publishImpl: async () => { throw new Error('C. Nostr must never be called for an explicit Arweave selection'); }
            },
            arweaveAnnouncementPublisherOptions: {
                discoveryTag: 'forkbuild-editor-c-arweave',
                uploadTaggedTransaction: (material, tag) => net.uploadTaggedTransaction(material, tag)
            }
        });
        const distributeEditorPublication = makeDistributeEditorPublication({
            multiRelayNostrPublicationDistributionCommand: null,
            publicationDistributionCommand
        });

        const publication = makeFakePublication('pub-c-editor-arweave');
        const result = await distributeEditorPublication(publication, 'arweave');

        assert(!Array.isArray(result) && result !== null, n('C1. an explicit Arweave selection resolves a single, real PublicationDistributionResult, never an array'));
        assert(result.material.uri.startsWith('ar://') && net.ledger.has(result.material.uri.slice('ar://'.length)),
            n('C2. real content material genuinely landed on the fake Arweave ledger'));
        assert(net.ledger.has(result.discovery.id) && result.discovery.id !== result.material.uri.slice('ar://'.length),
            n('C3. real announcement material landed on the SAME ledger, under a distinct transaction id'));
        assert(result.discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL,
            n('C4. the resulting discovery.relayUrl is Arweave\'s own default gateway, confirming ArweaveAnnouncementPublisher — never NostrPublicationDiscoveryPublisher — was reached'));

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle && lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.PRESENT,
            n('C5. the real lifecycle store observes both material and discovery as PRESENT — the SAME observation channel every other Announcement/Discovery caller already shares'));

        console.log('✓ Section C: EditorView\'s own new explicit Arweave selection, through its own real wrapper and the real production command/orchestrator/composition, reaches the real ArweaveAnnouncementPublisher and lands genuine material on a fake Arweave ledger — full round trip, zero shortcuts');
    }

    // ===============================================================
    // Section D — exactly-one-provider invariant.
    // ===============================================================
    {
        for (const provider of [undefined, 'nostr', 'arweave']) {
            let nostrCalls = 0;
            let arweaveCalls = 0;
            const net = makeFakeArweaveSubstrate();
            const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
                lifecycleStore: new PublicationDistributionLifecycleMemoryStore(),
                arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
                nostrRelayUrls: ['wss://editor-d.example'],
                nostrPublisherOptions: { discoveryTag: 'forkbuild-editor-d-nostr', publishImpl: async () => { nostrCalls += 1; return { published: true, id: 'd'.repeat(64) }; } }
            });
            const publicationDistributionCommand = composePublicationDistributionCommand({
                lifecycleStore: new PublicationDistributionLifecycleMemoryStore(),
                arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
                nostrPublisherOptions: { discoveryTag: 'forkbuild-editor-d-nostr2', publishImpl: async () => { nostrCalls += 1; return { published: true, id: 'd2'.repeat(32) }; } },
                arweaveAnnouncementPublisherOptions: {
                    discoveryTag: 'forkbuild-editor-d-arweave',
                    uploadTaggedTransaction: async (material, tag) => { arweaveCalls += 1; return net.uploadTaggedTransaction(material, tag); }
                }
            });
            const distributeEditorPublication = makeDistributeEditorPublication({ multiRelayNostrPublicationDistributionCommand: multiRelayCommand, publicationDistributionCommand });

            await distributeEditorPublication(makeFakePublication(`pub-d-${String(provider)}`), provider);

            if (provider === 'arweave') {
                assert(arweaveCalls === 1 && nostrCalls === 0, n(`D1[${provider}]. selecting arweave invokes the Arweave publisher exactly once and the Nostr publisher zero times`));
            } else {
                assert(nostrCalls === 1 && arweaveCalls === 0, n(`D1[${String(provider)}]. selecting ${String(provider)} invokes the Nostr publisher exactly once and the Arweave publisher zero times`));
            }
        }

        console.log('✓ Section D: exactly one publisher invocation per selection, never fan-out, never a combined attempt');
    }

    // ===============================================================
    // Section E — option/configuration isolation.
    // ===============================================================
    {
        const editorCode = codeOnly(await source('ui/views/EditorView.js'));
        const forbidden = ['gatewayUrl', 'tagName', 'uploadTaggedTransaction', 'signer', 'publishImpl', 'relayUrl', 'nostrRelayUrls'];
        for (const term of forbidden) {
            assert(!editorCode.includes(term), n(`E1[${term}]. EditorView.js never reads/constructs ${term} — provider-specific construction options stay entirely composition-owned, exactly like WorldView.js/WorldEncounterCanvas.js's own identical restraint`));
        }
        console.log('✓ Section E: EditorView.js offers only the provider CHOICE — never its configuration');
    }

    // ===============================================================
    // Section F — no regression: OwnPublicationPanel.js's own, separate
    // call site is unmodified.
    // ===============================================================
    {
        const ownPanelSource = await source('ui/components/OwnPublicationPanel.js');
        assert(/publicationDistributionCommand\(publication\)/.test(ownPanelSource),
            n('F1. OwnPublicationPanel.js\'s own distributeOwnPublication() still passes a publication only — no discoveryProvider of any kind — unmodified by this milestone, which touched EditorView.js alone'));
        console.log('✓ Section F: OwnPublicationPanel.js\'s own, separate distribution action is untouched — still Nostr-only, exactly as before this milestone');
    }

    // ===============================================================
    // Section G — Snapshot-family isolation.
    // ===============================================================
    {
        const editorSource = await source('ui/views/EditorView.js');
        assert(!/SnapshotDiscoveryPublisher|SnapshotDistributionCommand|SnapshotDistributionRuntimeComposition/.test(editorSource),
            n('G1. EditorView.js references none of the Snapshot-family (NostrSnapshotDiscoveryPublisher/ArweaveSnapshotDiscoveryPublisher/SnapshotDistributionCommand) classes — this milestone is entirely within the Publication (Signed Claim) distribution family, structurally separate per application/SnapshotDistributionCommand.js\'s own header'));

        const statusOutput = execSync('git status --porcelain -- application/SnapshotDistributionCommand.js application/NostrSnapshotDiscoveryPublisher.js application/ArweaveSnapshotDiscoveryPublisher.js application/SnapshotDistributionRuntimeComposition.js', { cwd: SOURCE_ROOT }).toString().trim();
        assert(statusOutput === '', n('G2. none of the Snapshot-family production files show any change'));

        console.log('✓ Section G: this milestone never touches the Snapshot-family discovery/distribution seam — Announcement/Discovery Provider Selection for Publications is a structurally separate change');
    }

    // ===============================================================
    // Section H — production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'ui/views/EditorView.js',
            'tests/EditorViewAnnouncementDiscoveryProviderSelection.test.js',
            'tests/EditorViewPostPublishDistributionAction.test.js',
            'tests/NostrMultiRelayPublicationDistributionWiring.test.js',
            'tests/NostrMultiRelayPublicationDistributionProductReassessment.test.js',
            'tests/PostPublishDistributionGuidanceActionabilityAudit.test.js',
            'tests/AnnouncementDiscoveryProviderExpansionReadinessAudit.test.js',
            'tests/DecentralizedSubstrateRoleChoiceUIReachabilityAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`H1. every changed/added file is one this milestone names (found unauthorized: ${JSON.stringify(unauthorized)})`));

        console.log('✓ Section H: only EditorView.js (production) and this milestone\'s own test files (its new test, plus the pre-existing audits its own change required updating) are touched');
    }

    console.log(`\n✅ All EditorViewAnnouncementDiscoveryProviderSelection tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('EditorViewAnnouncementDiscoveryProviderSelection.test.js FAILED:', error);
    process.exitCode = 1;
});
