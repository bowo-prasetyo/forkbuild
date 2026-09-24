import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composePublicationDistributionCommand, composeMultiRelayNostrPublicationDistributionCommand } from '../application/publication/distribution/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/publication/distribution/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/publication/distribution/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/nostr/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { editorViewFiles } from './support/SourceFileGroups.js';

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
// Publication distribution — see application/snapshot/SnapshotDistributionCommand.js's
// own header, "No coupling to Signed Claim distribution." (A later,
// independently-scoped milestone gave EditorView.js its own, separate
// "Distribute Snapshot" action — Section G below now checks the real,
// still-true invariant precisely: THIS milestone's own
// distributeEditorPublication() never touches that family, never that
// EditorView.js as a whole never mentions it.)
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
//   G. Snapshot-family isolation — distributeEditorPublication() itself
//      never touches NostrSnapshotDiscoveryPublisher/
//      ArweaveSnapshotDiscoveryPublisher or the Snapshot distribution
//      seam (checked precisely by function body, not a file-wide grep —
//      EditorView.js later gained its own, separate Snapshot distribution
//      action, unrelated to this one).
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

// AMENDED — Section G below used to grep the ENTIRE file for the
// Snapshot-family names. A later, deliberately-scoped milestone (adding
// EditorView.js's own "Distribute Snapshot" action, mirroring
// WorldView.js's own distributeWorldEncounterSnapshot()) legitimately
// gives EditorView.js its first real references to that family — a
// second, independent capability, never a coupling of the two. This
// helper extracts just ONE function's own text by brace-balance, so
// Section G's real, still-true invariant (0.9.502's OWN
// distributeEditorPublication()/selectedDiscoveryProvider substrate
// choice for Publication distribution never reads or touches the
// Snapshot family) can still be checked precisely, independent of
// whatever else the file now also contains.
function extractFunctionBody(source, functionName) {
    const startMatch = source.match(new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`));
    if (!startMatch) {
        throw new Error(`extractFunctionBody: "${functionName}" not found`);
    }
    const braceStart = startMatch.index + startMatch[0].length - 1;
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(startMatch.index, i + 1);
            }
        }
    }
    throw new Error(`extractFunctionBody: unbalanced braces for "${functionName}"`);
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
        const editorSource = (await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n');
        // AMENDED BY 0.9.672 — Editor View Distribution Dialog. This
        // <select> now lives in EditorDistributionDialog.js, one popup
        // over from a "Distribute" trigger button (a pure presentation
        // relocation — see that file's own header). EditorView.js still
        // owns selectedDiscoveryProvider itself (page-local UI state,
        // unmodified) and threads it down via v-model on the dialog
        // component.
        const dialogSource = await source('ui/components/EditorDistributionDialog.js');

        assert(/v-model:discovery-provider="selectedDiscoveryProvider"/.test(editorSource),
            n('A1. EditorView.js still threads selectedDiscoveryProvider into the dialog'));
        assert(/<select[^>]*v-model="discoveryProviderModel"/.test(dialogSource),
            n('A1b. EditorDistributionDialog.js itself still renders the real <select> that choice controls'));
        assert(/<option value="nostr">Nostr<\/option>/.test(dialogSource),
            n('A2. exactly one option offers Nostr'));
        assert(/<option value="arweave">Arweave<\/option>/.test(dialogSource),
            n('A3. exactly one option offers Arweave'));

        // AMENDED BY 0.9.670 — Publication Material Storage Selection. This
        // assertion originally counted every `<option>` in the whole file as
        // a proxy for "the Announcement/Discovery substrate select is the
        // only picker this view has, offering exactly these two choices" —
        // true only because, at 0.9.502, it genuinely was the only picker.
        // 0.9.670 gave this view a second, independent picker (Material
        // storage — WHERE a Publication's material goes, a decision
        // entirely separate from discoveryProvider, mirroring
        // OwnPublicationPanel.js's own identical addition), so a file-wide
        // count of 2 no longer holds. The assertion now scopes to the
        // `<select v-model="discoveryProviderModel">` element alone,
        // preserving the original intent exactly: THAT select still offers
        // exactly Nostr and Arweave, no more, no fewer.
        const discoveryProviderSelectMatch = dialogSource.match(/<select\s+v-model="discoveryProviderModel"[\s\S]*?<\/select>/);
        assert(discoveryProviderSelectMatch !== null, n('A4a. the discoveryProviderModel <select> element is isolable'));
        const optionMatches = (discoveryProviderSelectMatch ? discoveryProviderSelectMatch[0] : '').match(/<option value="[^"]*">/g) || [];
        assert(optionMatches.length === 2,
            n(`A4. exactly two <option> elements exist inside the selectedDiscoveryProvider <select> (found ${optionMatches.length}) — the currently supported choices, no more, no fewer`));

        // AMENDED BY 0.9.667 — Role Provider Preference As Dropdown
        // Default. selectedDiscoveryProvider no longer hardcodes 'nostr'
        // directly; it now opens on the injected defaultAnnouncementDiscoveryProvider
        // (ui/main.js's own resolved ANNOUNCEMENT_AND_DISCOVERY preference,
        // itself falling back to 'nostr' when nothing is saved) — the exact
        // "preference is read only as the DEFAULT when no explicit choice
        // is made" restraint ui/views/AnnouncementDiscoveryProviderSettingsView.js's
        // own header already promised. A mount that never touches the
        // control, and whose parent never supplies the injection (e.g. a
        // test harness), still defaults to 'nostr' — the inject's own
        // fallback — so every pre-0.9.502 mount's behavior is unchanged for
        // anyone who has never saved a preference.
        assert(/const defaultAnnouncementDiscoveryProvider = inject\('defaultAnnouncementDiscoveryProvider',\s*'nostr'\);/.test(editorSource),
            n('A5a. defaultAnnouncementDiscoveryProvider is injected with an explicit \'nostr\' fallback'));
        assert(/const selectedDiscoveryProvider = ref\(defaultAnnouncementDiscoveryProvider\);/.test(editorSource),
            n('A5b. selectedDiscoveryProvider opens on that injected default — matching PublicationDistributionRuntimeComposition.js\'s own \'nostr\' default whenever nothing has been saved, so a mount that never touches the control, and whose parent injects nothing, behaves exactly as every pre-0.9.502 mount already did'));

        // Rendered alongside the SAME action it configures, gated on
        // canDistributePublication — never its own always-visible panel.
        // AMENDED BY 0.9.672 — that gate now lives in
        // EditorDistributionDialog.js's own template, one popup over,
        // wrapping the entire Publication section (Material storage,
        // substrate select, and "Distribute now" button together) rather
        // than the substrate select alone.
        //
        // AMENDED — One Shared Distribution Settings Block. The substrate
        // select now lives in the dialog's single shared settings block,
        // ABOVE both per-protocol sections, read by both actions. It is
        // still never rendered unconditionally: the dialog itself only
        // mounts behind the "Distribute" trigger, which is gated on
        // canDistributeSnapshot || canDistributePublication.
        const settingsIndex = dialogSource.indexOf('<div class="editor-distribution-dialog-settings">');
        const selectIndex = dialogSource.indexOf('v-model="discoveryProviderModel"');
        const firstSectionIndex = dialogSource.indexOf('class="editor-distribution-dialog-section');
        assert(settingsIndex !== -1 && settingsIndex < selectIndex && selectIndex < firstSectionIndex
            && (dialogSource.match(/v-model="discoveryProviderModel"/g) || []).length === 1
            && /v-if="canDistributeSnapshot \|\| canDistributePublication"[\s\S]{0,200}editor-post-publish-distribute-trigger/.test(editorSource),
            n('A6. AMENDED — exactly one substrate control, in the shared settings block above both sections, reachable only through the capability-gated Distribute trigger'));

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
        const editorCode = codeOnly((await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n'));
        const forbidden = ['gatewayUrl', 'tagName', 'uploadTaggedTransaction', 'signer', 'publishImpl', 'relayUrl', 'nostrRelayUrls'];
        for (const term of forbidden) {
            assert(!editorCode.includes(term), n(`E1[${term}]. EditorView.js never reads/constructs ${term} — provider-specific construction options stay entirely composition-owned, exactly like WorldView.js/WorldEncounterCanvas.js's own identical restraint`));
        }
        console.log('✓ Section E: EditorView.js offers only the provider CHOICE — never its configuration');
    }

    // ===============================================================
    // Section F — no regression: OwnPublicationPanel.js's own, separate
    // call site is unmodified by THIS milestone (0.9.502, EditorView.js
    // only).
    //
    // AMENDED BY 0.9.668 — Bug fix. OwnPublicationPanel.js's own call site
    // is no longer publication-only as of that later milestone — it gained
    // its own explicit Announcement/Discovery substrate choice, closing a
    // real bug (that panel's "Distribute Publication" button always used
    // Nostr regardless of the saved preference). This section's own scope
    // is unchanged: it still verifies only that 0.9.502 itself touched
    // EditorView.js alone, not that OwnPublicationPanel.js stays
    // publication-only forever.
    // ===============================================================
    {
        const ownPanelSource = await source('ui/components/OwnPublicationPanel.js');
        // AMENDED BY 0.9.670 — Publication Material Storage Selection. This
        // call site gained two more forwarded arguments
        // (`publicationMaterialStorage`, and a conditional remote-pinning
        // options object) and was reformatted across multiple lines to fit
        // — the regex now tolerates whitespace/newlines and trailing
        // arguments rather than requiring the call to end immediately after
        // `this.publicationDiscoveryProvider`, but still confirms the exact
        // same 0.9.668 fact this section exists to protect: `publication`
        // and `this.publicationDiscoveryProvider` are still the first two
        // arguments, in the same order.
        // AMENDED — One Shared Distribution Settings Block: now the
        // panel's one shared `distributionDiscoveryProvider`.
        assert(/publicationDistributionCommand\(\s*publication,\s*this\.distributionDiscoveryProvider/.test(ownPanelSource),
            n('F1. AMENDED BY 0.9.668 — OwnPublicationPanel.js\'s own distributeOwnPublication() now forwards its own explicit discoveryProvider choice too, unrelated to this milestone\'s own EditorView.js-only scope'));
        console.log('✓ Section F: OwnPublicationPanel.js\'s own, separate distribution action is untouched by THIS (0.9.502) milestone — its later 0.9.668 substrate-choice fix is verified elsewhere');
    }

    // ===============================================================
    // Section G — Snapshot-family isolation, scoped to THIS milestone's
    // own distributeEditorPublication()/selectedDiscoveryProvider seam
    // (see extractFunctionBody's own header for why the file-wide grep
    // this section used to run no longer holds).
    // ===============================================================
    {
        const editorSource = (await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n');
        const snapshotFamilyPattern = /SnapshotDiscoveryPublisher|SnapshotDistributionCommand|SnapshotDistributionRuntimeComposition/;
        const publicationDistributionFunction = extractFunctionBody(editorSource, 'distributeEditorPublication');
        assert(!snapshotFamilyPattern.test(publicationDistributionFunction),
            n('G1. distributeEditorPublication() — 0.9.502\'s own Announcement/Discovery substrate choice for Publication distribution — references none of the Snapshot-family (NostrSnapshotDiscoveryPublisher/ArweaveSnapshotDiscoveryPublisher/SnapshotDistributionCommand) classes, structurally separate per application/snapshot/SnapshotDistributionCommand.js\'s own header'));

        // G2 used to assert `git status --porcelain` was empty for the
        // Snapshot-family files listed above — a live working-tree check
        // that could only ever describe THIS milestone's own diff at the
        // moment it was authored, never "Snapshot distribution never gains
        // an Arweave alternative." A later, separately-scoped milestone
        // (Announcement/Discovery Provider Selection, extended to the
        // Snapshot and Place Naming families) legitimately touches
        // application/snapshot/SnapshotDistributionRuntimeComposition.js — G1, above,
        // already carries this section's real, durable invariant, now
        // precisely scoped: distributeEditorPublication() itself never
        // references any Snapshot-family class, regardless of what those
        // files independently contain, OR what OTHER, independent
        // capabilities EditorView.js later gains (a later milestone gave
        // it its own, separate "Distribute Snapshot" action — see
        // ui/views/EditorView.js's own distributeEditorSnapshot(), never
        // called by or coupled to distributeEditorPublication() itself).
        console.log('✓ Section G: distributeEditorPublication() never references the Snapshot-family discovery/distribution seam — Announcement/Discovery Provider Selection for Publications stays structurally separate from Snapshot distribution, even now that EditorView.js hosts both as independent actions');
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
