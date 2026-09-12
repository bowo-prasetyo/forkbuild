import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { orchestratePublicationDistribution } from '../application/PublicationDistributionOrchestrator.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';

// 0.9.430 — Announcement/Discovery Provider Selection Reachability.
//
// 0.9.429's own audit found the exact seam this milestone closes:
// `application/PublicationDistributionRuntimeComposition.js`'s own
// `discoveryProvider: 'nostr' | 'arweave'` selection (0.9.428) was real,
// correct, and completely unreachable from any real caller — every
// production click silently distributed on Nostr. This milestone threads
// an explicit choice from the existing publication-distribution UI
// (`ui/components/WorldEncounterCanvas.js`'s own "Distribute Publication"
// action) through the existing application seam — never a second
// publication-distribution workflow — to that already-real selection.
//
//   Wanderer selects Nostr or Arweave
//        │  (WorldEncounterCanvas.js's own new <select>)
//        ▼
//   selectedDiscoveryProvider   (page-local UI state, default 'nostr')
//        │  distributeSelectedPublication()
//        ▼
//   distributionCommand(publication, selectedDiscoveryProvider)
//        │  (WorldView.js's own distributeWorldEncounterPublication(), amended)
//        ▼
//   publicationDistributionCommand({ ..., discoveryProvider })
//        │  (composePublicationDistributionCommand()'s own returned function)
//        ▼
//   executePublicationDistributionCommand({ ..., discoveryProvider, arweaveAnnouncementPublisherOptions })
//        │
//        ▼
//   orchestratePublicationDistribution({ ..., discoveryProvider, arweaveAnnouncementPublisherOptions })
//        │
//        ▼
//   composePublicationDistributionRuntime({ discoveryProvider, ... })   (0.9.47/0.9.428, unmodified)
//        │
//        ├──► NostrPublicationDiscoveryPublisher      (discoveryProvider === 'nostr', the default)
//        └──► ArweaveAnnouncementPublisher             (discoveryProvider === 'arweave')
//
// LETTERED SECTIONS (matching this milestone's own brief):
//   A. UI choice exists — the real publication-distribution UI exposes
//      exactly the two currently supported choices, Nostr and Arweave.
//   B. Nostr backward compatibility — an explicit/default Nostr selection
//      reaches the existing Nostr publisher, through the real chain.
//   C. Arweave reachability — an explicit Arweave selection reaches
//      ArweaveAnnouncementPublisher, through the real production
//      composition.
//   D. End-to-end Arweave publication — UI selection -> application
//      pipeline -> Arweave publisher -> fake Arweave ledger, round trip.
//   E. Exactly-one-provider invariant — each selection produces exactly
//      one publisher invocation; the other provider receives zero calls.
//   F. Option/configuration isolation — provider-specific construction
//      options remain composition-owned, never reconstructed by the
//      UI/application layers.
//   G. Invalid provider — the existing synchronous validation remains
//      authoritative; an invalid value never silently falls back to Nostr.
//   H. No regression — existing callers that omit discoveryProvider
//      continue to use Nostr.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE (see each touched file's own
// header for the full restraint): multi-provider selection, fan-out,
// automatic fallback, provider health/ranking, global substrate settings,
// endpoint configuration UI, a generic SubstrateProvider, a new
// Announcement/Discovery registry, and any change to Content, Proof/
// Anchor, Nostr, or Arweave's own existing Content/Proof implementations.

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

// A minimal fake Arweave substrate covering exactly the two write paths
// this test needs: content upload (ArweavePublicationMaterialUploader's
// own untagged POST /tx) and announcement publication
// (ArweaveAnnouncementPublisher's own injected uploadTaggedTransaction) —
// the same technique tests/ArweaveAnnouncementDiscoveryIntegrationBoundaryAudit.test.js's
// own makeSharedFakeArweaveSubstrate() already establishes, trimmed to
// this test's own two roles.
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

async function run() {
    // ===============================================================
    // Section A — UI choice exists.
    // ===============================================================
    {
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');

        assert(/<select[^>]*v-model="selectedDiscoveryProvider"/.test(canvasSource),
            n('A1. WorldEncounterCanvas.js renders a <select> bound to selectedDiscoveryProvider'));
        assert(/<option value="nostr">Nostr<\/option>/.test(canvasSource),
            n('A2. exactly one option offers Nostr'));
        assert(/<option value="arweave">Arweave<\/option>/.test(canvasSource),
            n('A3. exactly one option offers Arweave'));

        const optionMatches = canvasSource.match(/<option value="[^"]*">/g) || [];
        assert(optionMatches.length === 2,
            n(`A4. exactly two <option> elements exist anywhere in this file (found ${optionMatches.length}) — the currently supported choices, no more, no fewer`));

        assert(/selectedDiscoveryProvider: 'nostr'/.test(canvasSource),
            n('A5. selectedDiscoveryProvider defaults to \'nostr\' in data() — matching PublicationDistributionRuntimeComposition.js\'s own default, so a mount that never touches the control behaves exactly as every pre-0.9.430 mount already did'));

        // The control is rendered alongside the existing action, gated on
        // the SAME distributionCommand prop, never its own always-visible
        // panel or a global settings surface.
        const selectIndex = canvasSource.indexOf('v-model="selectedDiscoveryProvider"');
        const precedingWindow = canvasSource.slice(Math.max(0, selectIndex - 400), selectIndex);
        assert(/v-if="distributionCommand"/.test(precedingWindow),
            n('A6. the substrate control is gated on the same distributionCommand prop as the existing Distribute Publication action, never rendered unconditionally'));

        console.log('✓ Section A: the real publication-distribution UI (WorldEncounterCanvas.js\'s own Distribution panel) exposes exactly the two currently supported Announcement/Discovery substrates, Nostr and Arweave, defaulting to Nostr');
    }

    // ===============================================================
    // Section B — Nostr backward compatibility.
    // ===============================================================
    {
        let nostrCalls = 0;
        let arweaveCalls = 0;
        const net = makeFakeArweaveSubstrate();

        const arweaveUploaderOptions = { signer: net.contentSigner, fetchImpl: net.fetchImpl };
        const nostrPublisherOptions = {
            discoveryTag: 'campaign-b-nostr',
            publishImpl: async () => { nostrCalls += 1; return { published: true, id: 'b'.repeat(64) }; }
        };
        const arweaveAnnouncementPublisherOptions = {
            discoveryTag: 'campaign-b-arweave',
            uploadTaggedTransaction: async (material, tag) => { arweaveCalls += 1; return net.uploadTaggedTransaction(material, tag); }
        };

        // Every existing caller that omits discoveryProvider entirely.
        const implicit = await orchestratePublicationDistribution({
            publication: makeFakePublication('pub-b-implicit'),
            serializedMaterial: JSON.stringify({ body: 'b-implicit' }),
            arweaveUploaderOptions,
            nostrPublisherOptions,
            arweaveAnnouncementPublisherOptions
        });
        assert(nostrCalls === 1 && arweaveCalls === 0,
            n('B1. an omitted discoveryProvider reaches Nostr, not Arweave — the existing default, unchanged'));
        assert(implicit.discovery.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL,
            n('B2. ...confirmed structurally: the resulting discovery.relayUrl is Nostr\'s own default relay'));

        // An explicit discoveryProvider: 'nostr' — the value
        // WorldEncounterCanvas.js's own control sends when left at its
        // default.
        const explicit = await orchestratePublicationDistribution({
            publication: makeFakePublication('pub-b-explicit'),
            serializedMaterial: JSON.stringify({ body: 'b-explicit' }),
            arweaveUploaderOptions,
            discoveryProvider: 'nostr',
            nostrPublisherOptions,
            arweaveAnnouncementPublisherOptions
        });
        assert(nostrCalls === 2 && arweaveCalls === 0,
            n('B3. an explicit discoveryProvider: \'nostr\' reaches Nostr identically to the omitted case'));
        assert(explicit.discovery.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL,
            n('B4. ...confirmed structurally, identically to B2'));

        console.log('✓ Section B: an explicit or default Nostr selection reaches the existing NostrPublicationDiscoveryPublisher, through the real, unmodified production orchestrator — zero regression for every existing caller');
    }

    // ===============================================================
    // Section C — Arweave reachability.
    // ===============================================================
    {
        let nostrCalls = 0;
        let arweaveCalls = 0;
        const net = makeFakeArweaveSubstrate();

        const arweaveUploaderOptions = { signer: net.contentSigner, fetchImpl: net.fetchImpl };
        const nostrPublisherOptions = {
            discoveryTag: 'campaign-c-nostr',
            publishImpl: async () => { nostrCalls += 1; return { published: true, id: 'c'.repeat(64) }; }
        };
        const arweaveAnnouncementPublisherOptions = {
            discoveryTag: 'campaign-c-arweave',
            uploadTaggedTransaction: async (material, tag) => { arweaveCalls += 1; return net.uploadTaggedTransaction(material, tag); }
        };

        const result = await orchestratePublicationDistribution({
            publication: makeFakePublication('pub-c-arweave'),
            serializedMaterial: JSON.stringify({ body: 'c-arweave' }),
            arweaveUploaderOptions,
            discoveryProvider: 'arweave',
            nostrPublisherOptions,
            arweaveAnnouncementPublisherOptions
        });

        assert(arweaveCalls === 1 && nostrCalls === 0,
            n('C1. discoveryProvider: \'arweave\' reaches ArweaveAnnouncementPublisher\'s own injected uploadTaggedTransaction — never Nostr\'s publishImpl'));
        assert(result.discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL,
            n('C2. ...confirmed structurally: the resulting discovery.relayUrl is Arweave\'s own default gateway, never Nostr\'s default relay'));
        assert(typeof result.discovery.id === 'string' && net.ledger.has(result.discovery.id),
            n('C3. the announcement transaction genuinely landed in the real ArweaveAnnouncementPublisher\'s own publish() call, confirmed against the fake ledger it wrote to'));
        assert(result.material.uri.startsWith('ar://'),
            n('C4. content upload still ran through the real, unmodified ArweavePublicationMaterialUploader, independent of which discovery substrate was selected'));

        console.log('✓ Section C: an explicit Arweave selection reaches the real, production ArweaveAnnouncementPublisher, through the real orchestrator/composition — the exact gap 0.9.429 found and this milestone closes');
    }

    // ===============================================================
    // Section D — end-to-end Arweave publication: UI selection ->
    // application pipeline -> Arweave publisher -> fake Arweave ledger.
    // ===============================================================
    {
        // Reproduces ui/views/WorldView.js's own distributeWorldEncounterPublication()
        // verbatim — the established convention this test family already
        // uses (see e.g. tests/PostPublishDistributionEntryPoint.test.js's
        // own local reproduction) — guarded by a direct source match so
        // this reproduction cannot silently drift from the real function.
        const worldViewSource = await source('ui/views/WorldView.js');
        assert(codeOnly(worldViewSource).includes('function distributeWorldEncounterPublication(publication, discoveryProvider)'),
            n('D1. WorldView.js\'s own distributeWorldEncounterPublication(publication, discoveryProvider) exists with exactly this signature — the reproduction below mirrors it'));

        function makeDistributeWorldEncounterPublication(publicationDistributionCommand) {
            return function distributeWorldEncounterPublication(publication, discoveryProvider) {
                if (!publicationDistributionCommand) {
                    return Promise.reject(new Error('Publication distribution is not available.'));
                }
                return publicationDistributionCommand({
                    publication,
                    serializedMaterial: JSON.stringify(publication.toJSON()),
                    discoveryProvider
                });
            };
        }

        const net = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveUploaderOptions = { signer: net.contentSigner, fetchImpl: net.fetchImpl };
        const nostrPublisherOptions = {
            discoveryTag: 'campaign-d-nostr',
            publishImpl: async () => { throw new Error('D. Nostr must never be called for an explicit Arweave selection'); }
        };
        const arweaveAnnouncementPublisherOptions = {
            discoveryTag: 'campaign-d-arweave',
            uploadTaggedTransaction: (material, tag) => net.uploadTaggedTransaction(material, tag)
        };

        // Exactly ui/main.js's own real composition call, with a fake-
        // backed configuration standing in for real host capabilities.
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions,
            nostrPublisherOptions,
            arweaveAnnouncementPublisherOptions
        });
        const distributeWorldEncounterPublication = makeDistributeWorldEncounterPublication(publicationDistributionCommand);

        const publication = makeFakePublication('pub-d-e2e');
        const result = await distributeWorldEncounterPublication(publication, 'arweave');

        assert(result !== null, n('D2. the end-to-end call resolves a real PublicationDistributionResult, not null'));
        assert(result.material.uri.startsWith('ar://') && net.ledger.has(result.material.uri.slice('ar://'.length)),
            n('D3. real content material genuinely landed on the fake Arweave ledger'));
        assert(net.ledger.has(result.discovery.id),
            n('D4. real announcement material genuinely landed on the SAME fake Arweave ledger, under a distinct transaction id'));
        assert(result.discovery.id !== result.material.uri.slice('ar://'.length),
            n('D5. content and announcement remain two distinct Arweave transactions, even through the full UI-to-ledger round trip'));

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle && lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.PRESENT,
            n('D6. the real lifecycle store observes both material and discovery as PRESENT after the round trip — the SAME observation channel WorldEncounterCanvas.js\'s own Distribution panel already subscribes to'));

        console.log('✓ Section D: a real UI selection (\'arweave\'), forwarded through WorldView.js\'s own wrapper and the real production command/orchestrator/composition, reaches the real ArweaveAnnouncementPublisher and lands genuine material on a fake Arweave ledger — full round trip, zero shortcuts');
    }

    // ===============================================================
    // Section E — exactly-one-provider invariant.
    // ===============================================================
    {
        for (const provider of ['nostr', 'arweave']) {
            let nostrCalls = 0;
            let arweaveCalls = 0;
            const net = makeFakeArweaveSubstrate();

            await orchestratePublicationDistribution({
                publication: makeFakePublication(`pub-e-${provider}`),
                serializedMaterial: JSON.stringify({ body: `e-${provider}` }),
                arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
                discoveryProvider: provider,
                nostrPublisherOptions: {
                    discoveryTag: 'campaign-e-nostr',
                    publishImpl: async () => { nostrCalls += 1; return { published: true, id: 'e'.repeat(64) }; }
                },
                arweaveAnnouncementPublisherOptions: {
                    discoveryTag: 'campaign-e-arweave',
                    uploadTaggedTransaction: async (material, tag) => { arweaveCalls += 1; return net.uploadTaggedTransaction(material, tag); }
                }
            });

            if (provider === 'nostr') {
                assert(nostrCalls === 1 && arweaveCalls === 0, n(`E1[${provider}]. selecting nostr invokes the Nostr publisher exactly once and the Arweave publisher zero times`));
            } else {
                assert(arweaveCalls === 1 && nostrCalls === 0, n(`E1[${provider}]. selecting arweave invokes the Arweave publisher exactly once and the Nostr publisher zero times`));
            }
        }

        console.log('✓ Section E: exactly one publisher invocation per selection, in both directions — never fan-out, never a combined attempt');
    }

    // ===============================================================
    // Section F — option/configuration isolation.
    // ===============================================================
    {
        const worldViewCode = codeOnly(await source('ui/views/WorldView.js'));
        const canvasCode = codeOnly(await source('ui/components/WorldEncounterCanvas.js'));
        const forbidden = ['gatewayUrl', 'tagName', 'uploadTaggedTransaction', 'signer', 'publishImpl', 'relayUrl'];

        for (const term of forbidden) {
            assert(!worldViewCode.includes(term), n(`F1[${term}]. WorldView.js's own distributeWorldEncounterPublication() never reads/constructs ${term} — provider-specific options stay entirely composition-owned`));
            assert(!canvasCode.includes(term), n(`F2[${term}]. WorldEncounterCanvas.js never reads/constructs ${term} either — the UI offers only the provider CHOICE, never its configuration`));
        }

        // The composition-root binding itself: arweaveAnnouncementPublisherOptions
        // is forwarded verbatim, never spread into or reconstructed from
        // individual fields, at the one seam this milestone touches.
        const compositionCode = codeOnly(await source('application/PublicationDistributionCommandComposition.js'));
        assert(/arweaveAnnouncementPublisherOptions,/.test(compositionCode) && !/\.\.\.arweaveAnnouncementPublisherOptions/.test(compositionCode),
            n('F3. PublicationDistributionCommandComposition.js forwards arweaveAnnouncementPublisherOptions as one opaque value, never destructured or spread into individual fields'));

        console.log('✓ Section F: provider-specific construction options (gatewayUrl/tagName/uploadTaggedTransaction/signer/publishImpl/relayUrl) remain entirely composition-owned — neither the UI nor the application seam this milestone touches reads, constructs, or reconstructs any of them');
    }

    // ===============================================================
    // Section G — invalid provider: existing synchronous validation
    // remains authoritative.
    // ===============================================================
    {
        let nostrCalls = 0;
        let arweaveCalls = 0;
        const net = makeFakeArweaveSubstrate();
        let threw = null;

        try {
            await orchestratePublicationDistribution({
                publication: makeFakePublication('pub-g-invalid'),
                serializedMaterial: JSON.stringify({ body: 'g-invalid' }),
                arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
                discoveryProvider: 'ipfs',
                nostrPublisherOptions: {
                    discoveryTag: 'campaign-g-nostr',
                    publishImpl: async () => { nostrCalls += 1; return { published: true, id: 'g'.repeat(64) }; }
                },
                arweaveAnnouncementPublisherOptions: {
                    discoveryTag: 'campaign-g-arweave',
                    uploadTaggedTransaction: async (material, tag) => { arweaveCalls += 1; return net.uploadTaggedTransaction(material, tag); }
                }
            });
        } catch (error) {
            threw = error;
        }

        assert(threw !== null, n('G1. an unrecognized discoveryProvider throws — it never resolves a result of any kind'));
        assert(/unrecognized discoveryProvider "ipfs"/.test(threw.message),
            n('G2. the thrown error is composePublicationDistributionRuntime()\'s own existing, unmodified validation message — this milestone added no second validation layer'));
        assert(nostrCalls === 0 && arweaveCalls === 0,
            n('G3. neither publisher was ever constructed or called — the throw happens before either collaborator is built, exactly as PublicationDistributionRuntimeComposition.js\'s own header already documents'));

        // Confirmed directly against the one file that owns this
        // validation, too — never duplicated at any of the layers this
        // milestone threaded discoveryProvider through.
        for (const file of [
            'application/PublicationDistributionOrchestrator.js',
            'application/PublicationDistributionCommand.js',
            'application/PublicationDistributionCommandComposition.js'
        ]) {
            const code = codeOnly(await source(file));
            assert(!/unrecognized discoveryProvider/.test(code),
                n(`G4[${file}]. no second "unrecognized discoveryProvider" validation was added at this layer — composePublicationDistributionRuntime() remains the one place that throws`));
        }

        console.log('✓ Section G: an invalid discoveryProvider still throws synchronously, with the SAME message, before either publisher is ever touched — no fallback to Nostr, no second validation layer added anywhere this milestone threaded the parameter');
    }

    // ===============================================================
    // Section H — no regression: an omitted discoveryProvider continues
    // to use Nostr, through the exact composition-root seam ui/main.js
    // (and ui/components/OwnPublicationPanel.js's own distributeOwnPublication())
    // actually use.
    // ===============================================================
    {
        let nostrCalls = 0;
        let arweaveCalls = 0;
        const net = makeFakeArweaveSubstrate();

        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore: new PublicationDistributionLifecycleMemoryStore(),
            arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
            nostrPublisherOptions: {
                discoveryTag: 'campaign-h-nostr',
                publishImpl: async () => { nostrCalls += 1; return { published: true, id: 'a'.repeat(64) }; }
            },
            arweaveAnnouncementPublisherOptions: {
                discoveryTag: 'campaign-h-arweave',
                uploadTaggedTransaction: async (material, tag) => { arweaveCalls += 1; return net.uploadTaggedTransaction(material, tag); }
            }
        });

        // The EXACT request shape ui/components/OwnPublicationPanel.js's
        // own distributeOwnPublication() sends today — no discoveryProvider
        // field at all.
        const publication = makeFakePublication('pub-h-old-caller');
        const result = await publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });

        assert(nostrCalls === 1 && arweaveCalls === 0,
            n('H1. an old caller\'s request (no discoveryProvider field at all) still reaches Nostr, never Arweave'));
        assert(result.discovery.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL,
            n('H2. ...confirmed structurally: still Nostr\'s own default relay'));

        console.log('✓ Section H: every existing caller that omits discoveryProvider (ui/components/OwnPublicationPanel.js\'s own distributeOwnPublication() included) continues to use Nostr — zero regression from this milestone\'s own additive change');
    }

    console.log(`\nAll AnnouncementDiscoveryProviderSelectionReachability tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
