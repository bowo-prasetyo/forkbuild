import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';

// 0.9.431 — Multi-Substrate Announcement/Discovery Product Reassessment.
//
// Type: test-only product reassessment. No production file is touched.
//
// 0.9.428 built a real second Announcement/Discovery substrate
// (ArweaveAnnouncementPublisher). 0.9.429 proved the real production
// pipeline could reach it. 0.9.430 closed the one remaining reachability
// gap — a real Wanderer, through the real World View UI, can now select
// Nostr OR Arweave per distribution attempt. That closes the SELECTION
// question. It deliberately leaves open a DIFFERENT question, the one this
// milestone answers: now that both substrates are genuinely reachable, is
// selecting exactly one per attempt enough — or does the product's own
// decentralization goal actually require publishing to both at once?
//
//   G1: User can choose a decentralized substrate                 — MET (0.9.430)
//   G2: User can choose among multiple substrates                 — MET (0.9.430)
//   G3: User can publish the same announcement to multiple substrates — ?
//   G4: User automatically gets broader discovery reach           — ? (out of scope; see Section G)
//
// This audit answers G3 the same way 0.9.421 already answered the
// equivalent question for CONTENT substrates: by actually composing
// single-provider actions, live, against the real production command, and
// reading off what really happens — never from architectural intuition.
// Unlike 0.9.421's own subject (`core/PublicationSnapshotPlacement.js`'s
// own additive, unbounded, many-per-publication catalog), the Discovery
// dimension's own local bookkeeping (`PublicationDistributionLifecycle.js`
// / `...Transition.js` / `...Store.js`, 0.9.50-0.9.53) was deliberately
// built as a SINGLE slot per publication — "keyed by publication.id...
// never a distribution-dimension identity," "replacement, never merge."
// That design predates Arweave becoming a selectable substrate by dozens
// of milestones, and was never previously exercisable with two GENUINE,
// independently-selectable discovery substrates for the same publication,
// because until 0.9.430 every real caller always got Nostr. This is the
// first milestone able to actually run that scenario against the real
// production command, and Section C is the flagship test that does it.
//
// LETTERED SECTIONS (matching this milestone's own brief):
//   A. Reconstruct the current user capability — both branches of the
//      requested diagram, live, through the real composed command.
//   B. Re-evaluate the goal — G1/G2 confirmed; G3/G4 explicitly deferred
//      to Sections C/G, never asserted early.
//   C. Repeated single-provider composition — the flagship test: the SAME
//      publication, the SAME lifecycle store, Nostr then Arweave (and the
//      reverse order), checked against every failure mode the brief named.
//   D. Breadth vs. convenience — is there an actual user-visible
//      consequence from requiring two actions? (There is one — named
//      precisely, from Section C's own evidence.)
//   E. Partial success — do the existing independent material/discovery
//      facts already give sufficient semantics, without a new PARTIAL/
//      SUCCESS/FAILED vocabulary?
//   F. Preserve provenance — the structural reason Section C's collapse
//      happens: no array, list, or per-substrate key exists anywhere in
//      the lifecycle triple.
//   G. Discovery consequences — proving the Section C/D local collapse is
//      an OBSERVATION-layer artifact, never a ground-truth data loss.
//   H. UX cost — precisely how expensive is a second explicit action?
//   I. Three-model comparison.
//   J. The verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE (see the requesting brief):
// a multi-provider implementation, a checkbox UI, a fan-out coordinator,
// automatic fallback, provider ranking, health checking, retry
// orchestration, "preferred + fallback" semantics, a generalized substrate
// abstraction, new distribution-lifecycle vocabulary (no PENDING/PARTIAL/
// FAILED/CONFIRMED value is introduced anywhere in this file), and
// cross-role fan-out. Every finding below is reported, never fixed, here.

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

// A single fake Arweave substrate covering the two write paths this file
// needs (untagged content upload, tagged announcement upload) plus a real
// GraphQL search surface — the same technique
// tests/ArweaveAnnouncementDiscoveryIntegrationBoundaryAudit.test.js's own
// makeSharedFakeArweaveSubstrate() already established.
function makeFakeArweaveSubstrate() {
    const ledger = new Map(); // id -> { data, tag: { name, value } | null }
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
        const method = options.method || 'GET';

        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, { data: transaction.data, tag: null });
            return new Response('accepted', { status: 200 });
        }
        if (method === 'POST' && parsed.pathname === '/graphql') {
            const { query } = JSON.parse(options.body);
            const match = query.match(/name:\s*"([^"]*)"\s*,\s*values:\s*\[\s*"([^"]*)"\s*\]/);
            const edges = [];
            if (match) {
                const [, matchTagName, matchValue] = match;
                for (const [id, entry] of ledger.entries()) {
                    if (entry.tag && entry.tag.name === matchTagName && entry.tag.value === matchValue) {
                        edges.push({ node: { id } });
                    }
                }
            }
            return new Response(JSON.stringify({ data: { transactions: { edges } } }), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    async function uploadTaggedTransaction(material, tag) {
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }

    return { ledger, contentSigner, fetchImpl, uploadTaggedTransaction };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

async function run() {
    // ===============================================================
    // Section A — reconstruct the current user capability. Both branches
    // of the requested diagram, live, through ONE real composed command —
    // the exact seam ui/main.js itself builds, exercised the way
    // WorldView.js's own distributeWorldEncounterPublication() actually
    // calls it.
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        let nostrCalls = 0;

        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
            nostrPublisherOptions: {
                discoveryTag: 'campaign-a-nostr',
                publishImpl: async () => { nostrCalls += 1; return { published: true, id: 'a'.repeat(64) }; }
            },
            arweaveAnnouncementPublisherOptions: {
                discoveryTag: 'campaign-a-arweave',
                uploadTaggedTransaction: net.uploadTaggedTransaction
            }
        });

        const nostrPublication = makeFakePublication('pub-a-nostr-branch');
        const nostrResult = await publicationDistributionCommand({
            publication: nostrPublication,
            serializedMaterial: JSON.stringify(nostrPublication.toJSON()),
            discoveryProvider: 'nostr'
        });
        assert(nostrResult !== null && nostrResult.discovery !== null, n('A1. User -> Nostr -> a real Nostr announcement, through the real composed command'));
        assert(nostrResult.discovery.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('A2. ...confirmed structurally as Nostr\'s own default relay'));
        assert(nostrCalls === 1, n('A3. exactly one Nostr publish call occurred'));

        const arweavePublication = makeFakePublication('pub-a-arweave-branch');
        const arweaveResult = await publicationDistributionCommand({
            publication: arweavePublication,
            serializedMaterial: JSON.stringify(arweavePublication.toJSON()),
            discoveryProvider: 'arweave'
        });
        assert(arweaveResult !== null && arweaveResult.discovery !== null, n('A4. User -> Arweave -> a real Arweave announcement, through the SAME composed command instance'));
        assert(arweaveResult.discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('A5. ...confirmed structurally as Arweave\'s own default gateway'));
        assert(net.ledger.has(arweaveResult.discovery.id), n('A6. ...and genuinely landed on the fake Arweave ledger, not merely reported'));

        assert(nostrResult.publication.objectId !== arweaveResult.publication.objectId, n('A7. both branches are real, independent, correctly attributed choices — never the same publication conflated across branches'));

        console.log('✓ Section A: both branches of the requested diagram are real, live, and reachable through one production command instance — Nostr and Arweave are genuine, independent, user-selectable choices today, not merely application-level capabilities');
    }

    // ===============================================================
    // Section B — re-evaluate the goal: G1/G2 confirmed from real source;
    // G3/G4 explicitly deferred, never asserted here.
    // ===============================================================
    {
        const runtimeCompositionSource = await source('application/PublicationDistributionRuntimeComposition.js');
        assert(/SELECTION, NEVER FAN-OUT/.test(runtimeCompositionSource), n('B1. G1/G2: PublicationDistributionRuntimeComposition.js itself documents that discoveryProvider is a SELECTION among substrates, never a set — confirming G1 (a decentralized substrate is choosable) and G2 (more than one exists to choose among)'));

        const net = makeFakeArweaveSubstrate();
        let threw = null;
        try {
            composePublicationDistributionRuntime({
                discoveryProvider: 'ipfs',
                arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
                nostrPublisherOptions: { discoveryTag: 'x', publishImpl: async () => null },
                arweaveAnnouncementPublisherOptions: { discoveryTag: 'y', uploadTaggedTransaction: net.uploadTaggedTransaction }
            });
        } catch (error) {
            threw = error;
        }
        assert(threw !== null, n('B2. G2 is bounded, not open-ended: exactly the two real substrates this codebase has actually built are selectable — a third, unbuilt substrate name still throws, synchronously, rather than silently degrading to one of the two real choices'));

        // G3 (publish the SAME announcement to multiple substrates) and G4
        // (automatically broader reach) are deliberately NOT asserted here
        // — see this file's own header, "Do not assume that G3 or G4
        // necessarily follows." Section C answers G3 from live evidence;
        // Section G answers G4's own narrower, discovery-reach half.
        console.log('✓ Section B: G1 and G2 are met, confirmed directly from PublicationDistributionRuntimeComposition.js\'s own source and its own synchronous validation boundary. G3 and G4 are deliberately left open here — see Sections C and G');
    }

    // ===============================================================
    // Section C — repeated single-provider composition. THE FLAGSHIP
    // TEST: the SAME publication, the SAME lifecycle store, distributed
    // once per substrate, in both orders — checked against every failure
    // mode the requesting brief named (overwriting, lost provenance,
    // confused identity, duplicated Content, duplicated Proof/Anchor,
    // corrupted results).
    // ===============================================================
    {
        let fakeNostrEventCounter = 0;
        function nextFakeNostrEventId() {
            fakeNostrEventCounter += 1;
            return String(fakeNostrEventCounter).padStart(64, '0');
        }

        async function distributeBothOrders(providerOrder) {
            const net = makeFakeArweaveSubstrate();
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publicationDistributionCommand = composePublicationDistributionCommand({
                lifecycleStore,
                arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
                nostrPublisherOptions: {
                    discoveryTag: 'campaign-c-nostr',
                    publishImpl: async () => ({ published: true, id: nextFakeNostrEventId() })
                },
                arweaveAnnouncementPublisherOptions: {
                    discoveryTag: 'campaign-c-arweave',
                    uploadTaggedTransaction: net.uploadTaggedTransaction
                }
            });

            const publication = makeFakePublication(`pub-c-${providerOrder.join('-then-')}`);
            const results = {};
            for (const provider of providerOrder) {
                results[provider] = await publicationDistributionCommand({
                    publication,
                    serializedMaterial: JSON.stringify(publication.toJSON()),
                    discoveryProvider: provider
                });
            }
            return { publication, results, lifecycleStore, net };
        }

        // --- Order 1: Nostr, then Arweave ---
        {
            const { publication, results, lifecycleStore } = await distributeBothOrders(['nostr', 'arweave']);
            const nostrResult = results.nostr;
            const arweaveResult = results.arweave;

            assert(nostrResult !== null && arweaveResult !== null, n('C1[nostr-then-arweave]. both independent calls resolve real, non-null results — no overwriting AT THE RESULT LEVEL, no crash from calling twice for one publication'));
            assert(nostrResult.publication.objectId === publication.id && arweaveResult.publication.objectId === publication.id, n('C2[nostr-then-arweave]. publication identity never confuses — both results correctly name the SAME publication they were actually distributing'));

            // Duplicating Content: named explicitly in the requesting
            // brief as a failure mode to check for. It happens — each
            // provider selection re-runs the full upload/describe/publish
            // sequence (0.9.49's own executor has "no caching, no retry,
            // no deduplication" by design), so identical bytes produce TWO
            // distinct Arweave content transactions.
            assert(nostrResult.material.uri !== arweaveResult.material.uri, n('C3[nostr-then-arweave]. Content IS duplicated by this composition — two independent material uploads of byte-identical material, a real (if modest) cost of the repeated-action model, never suppressed by any existing collaborator'));

            // Distinct, correctly-attributed discovery facts — no
            // cross-contamination between the two calls.
            assert(nostrResult.discovery.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('C4[nostr-then-arweave]. the first call\'s own discovery fact is genuinely Nostr\'s'));
            assert(arweaveResult.discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('C5[nostr-then-arweave]. the second call\'s own discovery fact is genuinely Arweave\'s'));
            assert(nostrResult.discovery.id !== arweaveResult.discovery.id, n('C6[nostr-then-arweave]. distinct announcement identities — no duplicated Proof/Anchor-style collision between the two substrates\' own announcement transactions'));

            // Corrupting distribution results: explicitly checked for, and
            // explicitly NOT found — the first call's own already-returned,
            // frozen result object is untouched by the second call.
            assert(Object.isFrozen(nostrResult) && nostrResult.discovery.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('C7[nostr-then-arweave]. the first result is frozen and structurally unchanged after the second call runs — no corruption of an already-obtained result'));

            // THE FLAGSHIP FINDING: overwriting DOES occur, but one layer
            // up from the results themselves — in the lifecycle STORE,
            // the one channel this application's own UI actually observes
            // (see Section D/E). The store's own single discovery slot,
            // "replacement, never merge" by explicit, pre-existing design
            // (0.9.52), now visibly collapses two genuinely independent,
            // still-valid discovery facts down to whichever ran last.
            const lifecycle = lifecycleStore.get(publication.id);
            assert(lifecycle !== null, n('C8[nostr-then-arweave]. the lifecycle store still returns a well-formed lifecycle, never null and never a thrown error — confirming this is a collapse, never a corruption'));
            assert(lifecycle.discovery.state === PublicationDistributionState.PRESENT, n('C9[nostr-then-arweave]. Discovery still reads PRESENT overall'));
            assert(lifecycle.discovery.origin === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('C10[nostr-then-arweave]. ...but its own origin now names ONLY Arweave — the substrate used LAST. The earlier, genuinely real Nostr announcement (still confirmed live in nostrResult, above) has no representation left anywhere in this publication\'s own locally observed lifecycle'));
            assert(lifecycle.discovery.id === arweaveResult.discovery.id, n('C11[nostr-then-arweave]. ...specifically, the stored discovery.id is the Arweave transaction id, not the earlier Nostr event id'));
            assert(lifecycle.material.uri === arweaveResult.material.uri, n('C12[nostr-then-arweave]. the identical collapse applies to Material too — the store also only ever remembers the LATEST of the two (duplicate) content uploads Section C3 already established'));

            console.log('✓ Section C (nostr-then-arweave): both substrate calls independently succeed with correct, uncorrupted, non-conflated results — but the lifecycle store\'s own single discovery/material slot collapses to whichever call ran last, silently dropping the earlier substrate\'s own local presence record');
        }

        // --- Order 2: Arweave, then Nostr — proving the collapse is
        // symmetric (whichever call runs LAST wins), never an
        // Arweave-specific asymmetry. ---
        {
            const { publication, results, lifecycleStore } = await distributeBothOrders(['arweave', 'nostr']);
            const arweaveResult = results.arweave;
            const nostrResult = results.nostr;

            assert(arweaveResult !== null && nostrResult !== null, n('C13[arweave-then-nostr]. both independent calls resolve real, non-null results, reversed order'));

            const lifecycle = lifecycleStore.get(publication.id);
            assert(lifecycle.discovery.origin === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('C14[arweave-then-nostr]. reversing the order reverses which substrate the lifecycle store retains — it is genuinely "whichever call ran last," never a bias toward either specific substrate'));
            assert(lifecycle.discovery.id === nostrResult.discovery.id, n('C15[arweave-then-nostr]. ...specifically, now the Nostr event id, confirming C10/C14 describe the same general mechanism from both directions'));

            console.log('✓ Section C (arweave-then-nostr): the collapse is symmetric — the lifecycle store always retains only the most recently distributed substrate\'s own fact, regardless of which substrate that happens to be');
        }

        // The mechanism is a pre-existing, explicit, documented design
        // decision (0.9.52) — never a defect this milestone discovers by
        // accident, and never something this milestone changes.
        const storeSource = await source('application/PublicationDistributionLifecycleStore.js');
        assert(/REPLACEMENT, NEVER MERGE/.test(storeSource), n('C16. the collapse traces to an already-existing, explicitly documented design decision (PublicationDistributionLifecycleStore.js\'s own "Replacement, never merge" header) — newly EXERCISABLE with two genuine substrates only since 0.9.430, never newly introduced by this milestone'));

        console.log('✓ Section C: composing two single-provider actions for the SAME publication is achievable, correctly attributed, and non-corrupting at the RESULT level — but silently collapses this application\'s own LOCAL record of "which substrates has this publication been announced on" to a single slot, the one channel Section D/E\'s own evidence shows the real UI actually relies on');
    }

    // ===============================================================
    // Section D — breadth vs. convenience: is there an actual
    // user-visible consequence from requiring two actions?
    // ===============================================================
    {
        // Yes — named precisely by Section C's own evidence, never
        // speculated here. A Wanderer who distributes to Nostr, then
        // switches the substrate control and distributes to Arweave, sees
        // WorldEncounterCanvas.js's own "Discovery" line (bound to
        // distributionLifecycle.discovery.state/origin, sourced from
        // exactly the lifecycleStore Section C exercised) change to
        // reflect Arweave alone. The Nostr announcement remains real (see
        // Section G) but becomes invisible through this application's own
        // UI the moment a second substrate is used for the same
        // publication. This is a real, demonstrable consequence of
        // "requiring two actions" — but it is a consequence of the
        // OBSERVATION layer's own single-slot shape (Section F), not of
        // the two-actions execution model itself; a future multi-select
        // fan-out UI, wired to the SAME unmodified lifecycle triple, would
        // produce the identical collapse the moment it recorded a second
        // discovery fact for one publication. See Section J.
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        assert(/distributionLifecycle\.discovery\.state/.test(canvasSource) || /distributionDiscoveryState/.test(canvasSource), n('D1. WorldEncounterCanvas.js\'s own Distribution panel renders exactly one Discovery state per publication — confirmed structurally, not merely inferred from the lifecycle triple\'s own shape'));
        assert(!/discovery\[.*\]|discoveries\b/i.test(canvasSource), n('D2. ...and never renders a per-substrate list or array of discovery facts — there is no UI surface today that could even display Section C\'s own two independent facts side by side'));

        console.log('✓ Section D: requiring two actions has a real, user-visible consequence — but it is that the SECOND action\'s own substrate silently supersedes the first one\'s in the one place a Wanderer actually looks (the Distribution panel), never that the second action is itself expensive or error-prone to perform (see Section H)');
    }

    // ===============================================================
    // Section E — partial success: do the existing independent
    // material/discovery facts already give sufficient semantics?
    // ===============================================================
    {
        // Each call's own PublicationDistributionResult already answers
        // "did this substrate accept the announcement" independently,
        // with no new PARTIAL/SUCCESS/FAILED vocabulary required — proven
        // directly: an ordinary Nostr decline still reports a complete,
        // honest result.
        const net = makeFakeArweaveSubstrate();
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore: new PublicationDistributionLifecycleMemoryStore(),
            arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'campaign-e', publishImpl: async () => null },
            arweaveAnnouncementPublisherOptions: { discoveryTag: 'campaign-e', uploadTaggedTransaction: net.uploadTaggedTransaction }
        });
        const publication = makeFakePublication('pub-e-decline');
        const result = await publicationDistributionCommand({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider: 'nostr' });

        assert(result !== null && result.material !== null && result.discovery === null, n('E1. an ordinary Nostr decline still reports a complete, honest, per-call fact — material PRESENT, discovery null — with no SUCCESS/PARTIAL/FAILED status invented anywhere in the chain'));

        // But this per-call fact is sufficient ONLY for a caller that
        // actually captures it. The real UI does not — confirmed directly
        // from WorldEncounterCanvas.js's own header, which states its own
        // restraint explicitly, and from its own action method, which
        // discards distributionCommand()'s own resolved value entirely.
        const canvasSource = codeOnly(await source('ui/components/WorldEncounterCanvas.js'));
        assert(/never inspects a resolved result/.test(await source('ui/components/WorldEncounterCanvas.js')), n('E2. WorldEncounterCanvas.js\'s own header states, explicitly, that it never inspects a resolved distribution result — by design, since 0.9.104'));
        assert(/\.then\(\(\) => \{[\s\S]{0,200}distributionExecuting = false/.test(canvasSource), n('E3. ...confirmed in the real method: the settled call\'s own resolution value is discarded (the final .then() callback takes no parameter), never read, never displayed'));

        console.log('✓ Section E: independent per-call material/discovery facts already give sufficient semantics for a caller that captures them — but the real UI discards every call\'s own result and relies entirely on distributionLifecycleStore\'s own subscription (0.9.100), the exact channel Section C proved collapses to one substrate. No new PARTIAL/SUCCESS/FAILED vocabulary would fix this; it would need to be captured, or the store itself would need to retain more than one discovery fact — see Section F/J')
    }

    // ===============================================================
    // Section F — preserve provenance: the structural reason Section C's
    // collapse happens. No array, list, or per-substrate key exists
    // anywhere in the lifecycle triple.
    // ===============================================================
    {
        const lifecycleSource = codeOnly(await source('application/PublicationDistributionLifecycle.js'));
        const transitionSource = codeOnly(await source('application/PublicationDistributionLifecycleTransition.js'));
        const storeSource = codeOnly(await source('application/PublicationDistributionLifecycleStore.js'));

        for (const [name, code] of [
            ['PublicationDistributionLifecycle.js', lifecycleSource],
            ['PublicationDistributionLifecycleTransition.js', transitionSource]
        ]) {
            assert(!/Array\.isArray\(.*discovery/.test(code) && !/discoveries/i.test(code), n(`F1[${name}]. discovery is read/produced as a single plain object per lifecycle, never a list — no structural room for more than one concurrent discovery fact per publication`));
        }
        assert(/KEYED BY `publication\.id` — NEVER BY A DISTRIBUTION-DIMENSION IDENTITY/.test(await source('application/PublicationDistributionLifecycleStore.js')), n('F2. PublicationDistributionLifecycleStore.js\'s own header confirms the key space is publication identity alone — never (publicationId, provider), which is the one change that would let two substrates coexist in this store'));

        // Contrast, deliberately: `core/PublicationSnapshotPlacement.js`'s
        // own CONTENT catalog is genuinely additive/many-per-publication —
        // 0.9.421's own Section D already proved that, for a different
        // dimension. This section confirms that precedent does NOT
        // silently transfer to Discovery — the two dimensions have
        // genuinely different data shapes today, not merely different
        // volumes of the same shape.
        const placementSource = await source('core/PublicationSnapshotPlacement.js');
        assert(/ADDITIVE/.test(placementSource) && /ALSO retrievable/.test(placementSource), n('F3. by contrast, core/PublicationSnapshotPlacement.js\'s own header describes an explicitly ADDITIVE fact — a content hash can ALSO become retrievable from a new locator/storage, many placements coexisting per publication — confirming Section C\'s finding is specific to the Discovery dimension\'s own, different, single-slot shape, never a general property of this codebase\'s distribution facts'));

        // Within one call, the three identities the requesting brief
        // asked to keep distinct remain exactly that — already proven
        // live in Section C (nostrResult.discovery.id !== arweaveResult.discovery.id,
        // material uris distinct, publicationId shared on purpose); this
        // section confirms the SAME restraint is stated, explicitly, in
        // the pure boundary that produces those facts in the first place.
        assert(/THREE IDENTITIES, NEVER CONFLATED/.test(await source('application/PublicationDistributionResult.js')), n('F4. PublicationDistributionResult.js\'s own header independently states the "three identities, never conflated" restraint Section C\'s own results already demonstrate live'));

        console.log('✓ Section F: Section C\'s collapse is fully explained structurally — the lifecycle triple has genuinely no per-substrate key or list anywhere, unlike Content\'s own already-additive placement catalog. A single publication\'s per-call RESULT can and does keep two substrates\' facts distinct (Section C); this application\'s own durable, subscribed-to RECORD of that publication cannot, today');
    }

    // ===============================================================
    // Section G — discovery consequences: proving Section C/D's local
    // collapse is an OBSERVATION-layer artifact, never a ground-truth
    // data loss. Does having announcements on both substrates materially
    // improve discovery in a way a caller cannot obtain today through two
    // explicit actions? (No — both remain independently, externally
    // discoverable regardless of what this app's own lifecycle shows.)
    // ===============================================================
    {
        const net = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
            nostrPublisherOptions: {
                discoveryTag: 'campaign-g-nostr',
                publishImpl: async () => ({ published: true, id: '9'.repeat(64) })
            },
            arweaveAnnouncementPublisherOptions: {
                discoveryTag: 'campaign-g-arweave',
                uploadTaggedTransaction: net.uploadTaggedTransaction
            }
        });

        const publication = makeFakePublication('pub-g-groundtruth');
        const arweaveResult = await publicationDistributionCommand({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider: 'arweave' });
        // Nostr second — per Section C, this now supersedes Arweave in the
        // LOCAL lifecycle store.
        await publicationDistributionCommand({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider: 'nostr' });

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle.discovery.origin === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('G1. confirmed (per Section C): this application\'s own lifecycle now shows only Nostr for this publication'));

        // Ground truth: the real, unmodified ArweaveGraphqlDiscoveryQueryService,
        // querying only the substrate itself — never this application's own
        // lifecycle store — still finds the earlier Arweave announcement.
        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search('campaign-g-arweave');
        assert(candidates.length === 1 && candidates[0].uri === `ar://${arweaveResult.discovery.id}`, n('G2. the EARLIER Arweave announcement remains fully, independently discoverable directly from the Arweave substrate itself, even though this application\'s own lifecycle store no longer shows it — the collapse (Section C/D) never reached the substrate; it is purely local bookkeeping'));

        console.log('✓ Section G: a genuine capability gap would exist if publishing to both substrates were the ONLY way to make a publication discoverable on both — it is not. Both announcements are independently, externally discoverable today via each substrate\'s own reader (Arweave confirmed live here; Nostr\'s own already-tested, unmodified discovery path is not re-derived). What is missing is entirely this application\'s own ability to SHOW a Wanderer that both exist (Section C/D/F) — never the underlying decentralized reach itself');
    }

    // ===============================================================
    // Section H — UX cost: precisely how expensive is a second explicit
    // action?
    // ===============================================================
    {
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');

        // The button that triggers a distribution attempt is disabled only
        // while nothing is distributable, or while a call is already in
        // flight — never disabled merely because a distribution already
        // succeeded, and the select remains freely re-selectable at any
        // time it is not mid-call.
        assert(/:disabled="!distributablePublication \|\| distributionExecuting"/.test(canvasSource), n('H1. the Distribute action is gated only on "nothing to distribute" or "already in flight" — never on "already distributed once" — so a second, differently-configured attempt for the same publication is never blocked by a prior success'));
        assert(/:disabled="distributionExecuting"[^>]*>\s*<option value="nostr">/.test(canvasSource.replace(/\n\s*/g, ' ')), n('H2. the substrate <select> is disabled only mid-call, never after a completed distribution — a Wanderer can immediately reselect the other substrate'));

        // distributeSelectedPublication() itself never resets, clears, or
        // otherwise mutates selectedDiscoveryProvider or distributablePublication
        // — Section C\'s own two-call scenario is exactly what a real
        // Wanderer can already do with two ordinary interactions: change
        // the dropdown, click the button again. No re-entry of any other
        // configuration (relay/gateway/tag) is possible from this panel at
        // all — see 0.9.430's own Section F, "the UI offers only the
        // provider CHOICE."
        const methodStart = canvasSource.indexOf('distributeSelectedPublication()');
        const methodBody = canvasSource.slice(methodStart, methodStart + 900);
        assert(!/selectedDiscoveryProvider\s*=/.test(methodBody), n('H3. distributeSelectedPublication() itself never writes to selectedDiscoveryProvider — the Wanderer\'s own choice persists, unreset, ready for an immediate second, differently-configured click'));

        console.log('✓ Section H: the cost of "requiring two actions" is exactly two ordinary interactions (change one <select>, click one button already on screen) — never a repeat of the entire distribution workflow, never a re-entry of any configuration, and never blocked by a prior success');
    }

    // ===============================================================
    // Section I — three-model comparison, evaluated against the actual
    // evidence above, never architectural elegance alone.
    // ===============================================================
    {
        // | Model                     | Meaning                                            | Evidence |
        // |----------------------------|-----------------------------------------------------|----------|
        // | Single explicit selection  | Current implementation (0.9.428/0.9.430)             | Section A |
        // | Repeated explicit actions  | User performs the same action again, other substrate | Section C/G/H — correct, cheap (2 interactions), ground-truth-complete; LOCAL record of dual coverage is lost (Section C/D) |
        // | Multi-select fan-out       | One action publishes to several substrates           | Not built. Would still hit Section C's own collapse the instant it tried to record two discovery facts for one publication through the UNMODIFIED lifecycle triple — building the checkbox UI alone would not even fix the problem Section D names |
        assert(true, n('I1. this section is evaluative narrative over Sections A-H\'s own evidence — no new assertion of its own beyond the ones already made above'));
        console.log('✓ Section I: Repeated Explicit Actions already reaches genuine dual-substrate ground truth (Sections A, C, G) at a real but small UX cost (Section H) — its only real shortfall is that this application\'s own local record of "announced where" does not accumulate (Section C/D/F). Multi-Select Fan-Out would not, by itself, fix that shortfall either: it shares the identical, unmodified lifecycle triple, so it would need the SAME underlying change Section F names before it could show anything a checkbox UI implies it can already show');
    }

    // ===============================================================
    // Section J — the verdict.
    // ===============================================================
    {
        const verdict = 'CURRENT_SINGLE_SELECTION_SUFFICIENT_WITH_NAMED_OBSERVATION_GAP';

        // Confirmed once more, explicitly, that this milestone builds none
        // of the things it deliberately excluded — a pure documentation
        // check, guarding this file's own restraint.
        for (const file of [
            'application/PublicationDistributionLifecycle.js',
            'application/PublicationDistributionLifecycleTransition.js',
            'application/PublicationDistributionLifecycleStore.js',
            'application/PublicationDistributionRuntimeComposition.js',
            'application/PublicationDistributionOrchestrator.js',
            'application/PublicationDistributionCommand.js',
            'application/PublicationDistributionCommandComposition.js',
            'ui/components/WorldEncounterCanvas.js',
            'ui/views/WorldView.js'
        ]) {
            const code = await source(file);
            assert(!/PARTIAL_SUCCESS|DiscoveryProviderRegistry|AnnouncementPublisherRegistry|fanOut|FanOut/.test(code), n(`J1[${file}]. no fan-out coordinator, provider registry, or new PARTIAL_SUCCESS-style vocabulary was added anywhere this milestone touched (it touched none of these files at all — this is a pure production-code guard)`));
        }

        console.log(`
✓ Section J — VERDICT: ${verdict}

For the stated goal — decentralized-substrate reach — G1 and G2 are met
(0.9.430), and G3 is genuinely achievable today, correctly and cheaply, by
repeating a single-provider action once per substrate (Sections A, C, H):
two ordinary interactions, no fan-out, no new execution semantics, full
ground-truth discoverability on both substrates regardless of order
(Section G). Repeated Explicit Actions is therefore sufficient for the
decentralization goal itself, and this milestone recommends against
building a multi-select fan-out UI now, for the exact reason the requesting
brief itself warned against: a checkbox UI would not, by itself, fix the
one real gap this audit found.

That one real, precisely-named, NON-BLOCKING gap: this application's own
local record of "which substrates has this publication been announced on"
(PublicationDistributionLifecycle.js/...Transition.js/...Store.js, and
therefore WorldEncounterCanvas.js's own Distribution panel) is a single
slot per publication, "replacement, never merge," by explicit, pre-existing
design (0.9.52) — newly exercisable, never newly introduced, by this
milestone. It silently shows only the most recently used substrate once a
second one has been used for the same publication (Section C/D), even
though both announcements remain fully real and independently discoverable
by direct substrate query (Section G).

This is evidence for a possible FUTURE, narrowly-scoped milestone — never
a mandate to build one now, and never a justification for fan-out. If that
milestone is ever taken on, Section F already names its precise, minimal
shape: change the Discovery dimension's own local record from a single
fact per publication to a small, keyed-by-provider set of facts (mirroring
core/PublicationSnapshotPlacement.js's own already-additive Content
catalog) — an OBSERVATION/RETENTION data-shape change, never a new
execution model, never a PENDING/PARTIAL/FAILED lifecycle vocabulary, and
entirely independent of whether execution itself stays single-select,
repeated actions, or (later, separately justified) fan-out.
`);

        assert(verdict === 'CURRENT_SINGLE_SELECTION_SUFFICIENT_WITH_NAMED_OBSERVATION_GAP', n('J2. the verdict this file actually reports matches the verdict printed above'));
    }

    console.log(`\nAll MultiSubstrateAnnouncementDiscoveryProductReassessment tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
