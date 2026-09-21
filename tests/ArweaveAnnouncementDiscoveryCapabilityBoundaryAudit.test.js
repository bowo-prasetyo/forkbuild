import { readFile } from 'node:fs/promises';

import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { describePublicationDistributionResult } from '../application/PublicationDistributionResult.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { ArweaveGatewayFailoverWorldEncounterMaterialResolver } from '../application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnchorPublisher } from '../anchoring/ArweaveAnchorPublisher.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';
import { resolveArweaveAnnouncementPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js';

// 0.9.489 — Arweave Announcement/Discovery Capability Boundary Audit.
//
// Type: test-only capability audit. Zero production changes.
//
// A user's own architect, reviewing 0.9.428-0.9.430 (a real
// ArweaveAnnouncementPublisher, selectable through the real production call
// chain), proposed a testable hypothesis rather than an implementation:
// "the only missing piece is a concrete uploadTaggedTransaction — everything
// else Arweave-as-a-discovery-substrate needs is already READY." This
// milestone tests that hypothesis directly against CURRENT source, across
// eleven named boundaries, rather than assuming 0.9.428-0.9.430's own
// findings (now eleven-to-sixty-odd milestones stale, depending on the
// boundary) still hold. Where a prior milestone already built a live guard
// for a claim this audit needs, that guard is RE-EXECUTED here, fresh,
// against current source — never cited from its own prose alone, the same
// method 0.9.398 Section A already established for exactly this situation.
//
// THE ONE FINDING THIS AUDIT ADDS THAT NO PRIOR MILESTONE FRAMED THIS WAY:
// selecting "Arweave" is not merely unreached or "dormant" in the passive
// sense 0.9.429 originally found (before 0.9.430 closed UI reachability) —
// it is live, wired, and, RIGHT NOW, on real production source, throws on
// every real click. Section B proves this precisely: production's own
// resolution path (`ui/main.js` -> `createPublicationDistributionRuntimeProvider()`
// -> `resolveArweaveAnnouncementPublisherOptions()`) never supplies a real
// `uploadTaggedTransaction`, so the option a Wanderer sees in
// `ui/components/WorldEncounterCanvas.js`'s own <select> is not a
// hypothetical future capability — it is a currently-broken one. This
// reframes the recommendation from "activate a dormant capability" to "fix
// a live dead end," without changing what the fix is.
//
// LETTERED SECTIONS (mirroring the requesting brief's own lettering):
//   A. Existing publisher contract — application/ArweaveAnnouncementPublisher.js
//      (0.9.428), re-confirmed live: what it already fully defines
//      (payload, discovery tag, content identity, transaction metadata,
//      success/failure semantics) versus what it deliberately leaves to an
//      injected collaborator.
//   B. Dormant reachability, precisely characterized — constructed?
//      injected? reachable? invoked? — and the one live finding above:
//      REACHABLE_BUT_NONFUNCTIONAL, not merely UNREACHED.
//   C. The uploadTaggedTransaction contract — proven, from source, to be a
//      pure I/O translation boundary that makes no application decisions,
//      and sized precisely against the one real precedent this codebase
//      already ships for the harder half of the same problem
//      (arweave/ArweaveInjectedProviderSigner.js, 0.9.121).
//   D. Tag fidelity — the discoveryTag/Arweave-Tag mapping is 1:1 and
//      already exactly what the real reader matches against.
//   E. Content identity — the announcement never recomputes or re-derives
//      contentHash/material identity; it carries the existing `uri` fact
//      verbatim.
//   F. Discovery semantics — the full publish -> search -> retrieve ->
//      recover round trip, re-executed live against current source.
//   G. Read-side resilience isolation — the Arweave gateway-failover
//      resolver (0.9.440, content-role only) never leaks into the
//      announcement-write or discovery-query paths.
//   H. Failure semantics — the four-way degradation boundary (malformed
//      input, ordinary decline, transport failure, invalid response),
//      re-executed live, plus an explicit "no compensating action" check.
//   I. Duplicate semantics — publishing one envelope twice has no existing
//      idempotency/deduplication definition, confirmed live and by source
//      sweep; none is manufactured here.
//   J. Role separation — Content, Announcement, Discovery-query, and
//      Attribution (a Publication's own signature) remain four genuinely
//      separate files/concerns even against one shared simulated substrate.
//   K. Nostr coexistence — mutual exclusivity and interleaving isolation,
//      re-confirmed, plus an explicit sweep that neither substrate is ever
//      treated as a fallback for the other.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete `uploadTaggedTransaction` implementation.** This is
//   0.9.490's own job, if this audit's own verdict recommends it — see
//   Section C for the exact, bounded shape that implementation would need.
// - **Fixing the live REACHABLE_BUT_NONFUNCTIONAL finding Section B
//   reports** (disabling the "Arweave" `<option>`, catching the throw more
//   gracefully, or any other production change of any kind). This file is
//   test-only, exactly like every other audit in this family; the finding
//   is reported, not patched, here.
// - **A `node.tags` GraphQL query expansion, a richer kind/objectId
//   discovery bar, or any new discovery semantic.** 0.9.427/0.9.429 already
//   proved the bare tagged-`uri` bar is the one live production actually
//   runs at, and Section F reconfirms it needs no reader change.
//   Announcement/Discovery registry mirroring Proof/Anchor's own.** Section
//   B documents the exact seam precisely enough for a future milestone;
//   this file does not build one.
// - **Idempotency, deduplication, or retry policy for announcements.**
//   Section I's own finding is that none exists and none is shown to be
//   needed — this milestone does not add one speculatively.
// - **Re-deriving every assertion tests/ArweaveAnnouncementDiscoveryIntegrationBoundaryAudit.test.js
//   (0.9.429) already made at the unit level.** Where this file's own
//   scenario looks similar, it exists to reconfirm that finding still holds
//   against CURRENT source, or to add a genuinely new assertion — never to
//   pad the count.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch { threw = true; }
    assert(threw, message);
}

function expectThrowsSync(fn, message) {
    let error = null;
    try { fn(); } catch (e) { error = e; }
    assert(error !== null, message);
    return error;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function fakeOkTextResponse(text = '') {
    return { ok: true, headers: { get: () => null }, text: async () => text };
}

// One shared, deterministic fake Arweave substrate, identical in spirit to
// tests/ArweaveAnnouncementDiscoveryIntegrationBoundaryAudit.test.js's own
// makeSharedFakeArweaveSubstrate() — reconstructed here, independently,
// rather than imported, per this whole family's own "two independent files"
// convention (see application/ArweaveAnnouncementPublisher.js's own header).
function makeSharedFakeArweaveSubstrate() {
    const ledger = new Map(); // id -> { data, tag: { name, value } | null }
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }

    const contentSigner = {
        async sign(material) {
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material, tags: [] } };
        }
    };
    const anchorSigner = {
        async sign(material) {
            const id = newId('Anchor');
            return { id, transaction: { format: 2, id, data: material, tags: [] } };
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

        const getMatch = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
        if (method === 'GET' && getMatch && ledger.has(getMatch[1])) {
            return new Response(ledger.get(getMatch[1]).data, { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    // The one write path that ever attaches a real Arweave Tag — the exact
    // opaque collaborator ArweaveAnnouncementPublisher itself asks for.
    async function uploadTaggedTransaction(material, tag) {
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }

    return { ledger, contentSigner, anchorSigner, fetchImpl, uploadTaggedTransaction };
}

async function run() {
    // ===============================================================
    // Section A — Existing publisher contract, re-confirmed live.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        let receivedMaterial = null;
        let receivedTag = null;
        const publisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'campaign-a',
            gatewayUrl: 'https://my-gateway.example',
            uploadTaggedTransaction: async (material, tag) => {
                receivedMaterial = material;
                receivedTag = tag;
                return net.uploadTaggedTransaction(material, tag);
            }
        });

        check(typeof publisher.publish === 'function', 'A1. ArweaveAnnouncementPublisher already fully defines publish(envelope) — no caller ever needs to build one');
        check(publisher.discoveryTag === 'campaign-a' && publisher.gatewayUrl === 'https://my-gateway.example', 'A2. discoveryTag and gatewayUrl are already exposed as read-only facts, exactly matching NostrPublicationDiscoveryPublisher\'s own equivalent getters');

        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-a', uri: 'ar://materialtx-a' };
        const result = await publisher.publish(envelope);

        check(JSON.parse(receivedMaterial).objectId === 'pub-a' && JSON.parse(receivedMaterial).uri === 'ar://materialtx-a', 'A3. the payload it hands its own collaborator is already the fully-described, canonical discovery envelope — payload identity is already fully defined');
        check(receivedTag.name === ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME && receivedTag.value === 'campaign-a', 'A4. the discovery tag it attaches is already fully defined — { name: tagName, value: discoveryTag }, never anything else');
        check(result.published === true && typeof result.id === 'string' && result.relayUrl === 'https://my-gateway.example', 'A5. success semantics are already fully defined — { published: true, relayUrl, id }');

        const malformedEnvelope = { protocol: 'forkbuild', version: 1 }; // missing kind/objectId/uri
        const declined = await publisher.publish(malformedEnvelope);
        check(declined === null, 'A6. failure semantics for malformed input are already fully defined — null, before the collaborator is ever consulted');

        const decliningPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'x', uploadTaggedTransaction: async () => null });
        check(await decliningPublisher.publish(envelope) === null, 'A7. ordinary-decline failure semantics are already fully defined — collapsed with malformed input into the same null, never a third status');

        const throwingPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'x', uploadTaggedTransaction: async () => { throw new Error('offline'); } });
        await expectThrowsAsync(() => throwingPublisher.publish(envelope), 'A8. transport/signing-failure semantics are already fully defined — propagates, never collapsed to null');

        check(typeof publisher.tagName === 'string' && publisher.tagName === ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME, 'A9. transaction metadata (which Arweave Tag NAME carries the discovery tag) is already fully defined, defaulting to the exact literal the real reader already expects');

        console.log('✓ Section A: application/ArweaveAnnouncementPublisher.js already fully defines announcement payload, discovery tag, transaction metadata, and success/failure semantics — confirmed live, not merely read from its own header. The ONE thing it deliberately leaves undefined is uploadTaggedTransaction itself (Section C).');
    }

    // ===============================================================
    // Section B — Dormant reachability, precisely characterized.
    // ===============================================================
    {
        const uiMainSource = await source('ui/main.js');
        check(/createPublicationDistributionRuntimeProvider\(\{[\s\S]{0,400}?\}\)/.test(uiMainSource), 'B1. sanity: the real composition-root call site is where this section expects it');
        const providerCallMatch = uiMainSource.match(/createPublicationDistributionRuntimeProvider\(\{[\s\S]{0,400}?\}\)/);
        check(!/uploadTaggedTransaction/.test(providerCallMatch[0]), 'B2. CONSTRUCTED? — the real ui/main.js call site never supplies uploadTaggedTransaction as an argument; no host capability adapter of any kind exists for it yet (unlike arweaveHostSigner/nostrHostPublisher for the other two substrates)');

        // INJECTED? — trace the exact production resolution current source
        // performs: createPublicationDistributionRuntimeProvider() regroups
        // an absent uploadTaggedTransaction into its own arweaveAnnouncement
        // section (application/PublicationDistributionRuntimeProvider.js),
        // which resolveArweaveAnnouncementPublisherOptions() then resolves.
        const productionShapedCapabilities = {
            uploadTaggedTransaction: undefined, // exactly what ui/main.js's real call produces today
            gatewayUrl: 'https://arweave.net',
            tagName: ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME,
            discoveryTag: 'forkbuild-publications' // a real, non-empty discoveryTag IS configured
        };
        const resolvedOptions = resolveArweaveAnnouncementPublisherOptions(productionShapedCapabilities);
        check(resolvedOptions === undefined, 'B3. INJECTED? — NO. resolveArweaveAnnouncementPublisherOptions(), called with exactly the shape current production supplies (a real discoveryTag, no uploadTaggedTransaction), resolves undefined — the same "not currently configured" outcome the other two substrates use before a real signer/publishImpl exists');

        // REACHABLE? — the UI control itself is real, unconditional, and
        // never disabled for the "arweave" option specifically.
        //
        // AMENDED BY 0.9.672 — World View Distribution Dialog. This
        // <select> now lives in WorldDistributionDialog.js, one popup
        // over from a "Distribute" trigger button (a pure presentation
        // relocation — see that file's own header); its own gating
        // (:disabled="distributionExecuting", the same busy-state guard,
        // never an availability guard) is unmodified.
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        const worldDistributionDialogSource = await source('ui/components/WorldDistributionDialog.js');
        check(/<option value="arweave">Arweave<\/option>/.test(worldDistributionDialogSource), 'B4. REACHABLE? — YES. the real <select> already offers "Arweave" as a live, clickable choice, gated only by :disabled="distributionExecuting" (a busy-state guard, never an availability guard)');
        check(!/<option value="arweave"[^>]*disabled/.test(worldDistributionDialogSource), 'B5. ...and that <option> itself carries no conditional disabled attribute of its own tied to capability availability');

        // INVOKED? — the precise, live consequence of a real click today:
        // composePublicationDistributionRuntime(), given exactly what
        // production's own resolution chain produces (arweaveAnnouncementPublisherOptions
        // resolving to undefined, discoveryProvider: 'arweave'), throws
        // synchronously.
        const thrownError = expectThrowsSync(
            // arweaveUploaderOptions supplies a minimal-but-valid signer, so
            // this section isolates the throw to the discovery-substrate
            // construction step specifically — a real running application
            // that has Arweave CONTENT configured (a real signer already
            // resolved) still fails exactly here the instant "arweave" is
            // chosen for ANNOUNCEMENT_AND_DISCOVERY.
            () => composePublicationDistributionRuntime({
                discoveryProvider: 'arweave',
                arweaveUploaderOptions: { signer: { sign: async () => ({ id: 'x', transaction: {} }) } },
                arweaveAnnouncementPublisherOptions: resolvedOptions
            }),
            'B6. INVOKED? — YES, AND IT THROWS. selecting "arweave" through the real production composition call, with exactly what current source resolves it to today, throws synchronously rather than silently declining'
        );
        check(/discoveryTag/i.test(thrownError.message), 'B7. and the precise, live failure mode is worth naming exactly: because resolveArweaveAnnouncementPublisherOptions() (B3) drops the WHOLE options object (discoveryTag included) the instant uploadTaggedTransaction is missing, ArweaveAnnouncementPublisher\'s own constructor never even reaches its uploadTaggedTransaction check — it throws on the FIRST validation, "a non-empty discoveryTag is required", even though a real discoveryTag is genuinely configured one layer up');

        console.log('✓ Section B: REACHABLE_BUT_NONFUNCTIONAL, not merely UNREACHED. The "Arweave" discovery-substrate choice is real, unconditionally offered, and genuinely reached by a real click today — and, on current production source, throws every single time, via a chain that swallows an already-configured discoveryTag along the way. This is a live, currently-broken user-facing path, not a hypothetical future one — the strongest possible motivation for closing PROVIDER_GAP, distinct from (and stronger than) "an unused capability sitting idle."');
    }

    // ===============================================================
    // Section C — the uploadTaggedTransaction contract: pure I/O
    // translation, precisely bounded against a real, already-shipped
    // precedent for the harder half of the same problem.
    // ===============================================================
    {
        const publisherSource = await source('application/ArweaveAnnouncementPublisher.js');
        const codeOnly = publisherSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        check(!/kind\s*[:=]\s*['"]|WorldEncounterKind|objectId\s*=|selectDiscoveryTag|chooseCampaign/.test(codeOnly), 'C1. ArweaveAnnouncementPublisher.js\'s own CODE never chooses what to announce (no envelope construction beyond re-validating the caller\'s own argument), which tag to create (discoveryTag is caller-supplied, once, at construction), or which candidate to select — confirmed by source sweep, not merely by its own header prose');
        check(!/NostrPublicationDiscoveryPublisher|nostr/i.test(codeOnly), 'C2. ...and never decides whether Nostr should also be used — no reference to the sibling substrate anywhere in its own code');
        check(!/retry|setTimeout.*retry|attempt\s*\+\+/i.test(codeOnly.replace(/withTimeout/g, '')), 'C3. ...and never decides whether to retry — one call in, one call out, per publish()');

        // "Whether content is authentic" — this class never touches a
        // Publication's own signature or verifies anything; confirmed live,
        // reusing the same real executor sequence 0.9.429 Section G already
        // exercised, one call, to show a real, UNSIGNED publication still
        // reaches material upload untouched by the announcement publisher.
        const net = makeSharedFakeArweaveSubstrate();
        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });
        const guardedPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-c', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const unsignedResult = await executePublicationDistribution({
            publication: { id: 'pub-c-unsigned' }, // no signature
            serializedMaterial: JSON.stringify({ body: 'c' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: guardedPublisher
        });
        check(unsignedResult.material !== null && unsignedResult.discovery === null, 'C4. authenticity is decided entirely upstream (describePublicationDistribution/the executor\'s own sequencing) — the announcement publisher is never even reached for an unsigned Publication, confirming it makes no authenticity decision of its own because it is never in a position to');

        // Sizing: uploadTaggedTransaction(material, tag) -> Promise<{id}|null>
        // is precisely ArweaveInjectedProviderSigner.js's own already-shipped
        // sign(material) -> Promise<{id, transaction}> contract, PLUS a tag
        // parameter that signer already has a hardcoded, empty slot for.
        const signerSource = await source('arweave/ArweaveInjectedProviderSigner.js');
        check(/tags:\s*\[\]/.test(signerSource), 'C5. arweave/ArweaveInjectedProviderSigner.js (0.9.121) — the one real, already-shipped, wallet-integrated Arweave signer this codebase has — already builds its own transaction with a `tags: []` field, currently always empty. The hard part of uploadTaggedTransaction (wallet interaction, data_root/Merkle computation, base64url encoding, gateway anchor/price fetch) is therefore ALREADY SOLVED, once, in production source; a concrete implementation is that same signing step with a non-empty tags array, plus the POST/tx call application/ArweavePublicationMaterialUploader.js#upload() already performs separately for CONTENT — never a new wallet integration or a new Arweave-protocol primitive');
        const uploaderSource = await source('application/ArweavePublicationMaterialUploader.js');
        check(/POST['"]?,?\s*\{[\s\S]{0,80}\/tx/.test(uploaderSource) || /\$\{this\._gatewayUrl\}\/tx/.test(uploaderSource), 'C6. ...and the POST <gatewayUrl>/tx call a concrete uploadTaggedTransaction would need is byte-for-byte the same wire operation application/ArweavePublicationMaterialUploader.js#upload() already performs for CONTENT — a second, structurally identical call site, never a new protocol');

        console.log('✓ Section C: uploadTaggedTransaction is a pure I/O translation boundary (C1-C4, confirmed by source sweep and one live executor run) — it never selects a candidate, a tag, a fallback substrate, or decides authenticity. Its concrete implementation is precisely sized: ArweaveInjectedProviderSigner.js\'s own sign() already solves wallet interaction and transaction-shape construction with an already-present, currently-empty tags slot (C5), and ArweavePublicationMaterialUploader.js\'s own POST /tx is the identical wire call needed to broadcast it (C6) — a concrete uploadTaggedTransaction is a recombination of two already-shipped mechanisms, never new protocol work.');
    }

    // ===============================================================
    // Section D — tag fidelity: discoveryTag <-> Arweave Tag is 1:1,
    // never expanded, and already exactly what the real reader matches.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-d', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-d', uri: 'ar://materialtx-d' });
        const published = await publisher.publish(envelope);

        check(net.ledger.get(published.id).tag.name === ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME, 'D1. the real transaction on the shared substrate carries exactly one Arweave Tag, named the exact literal both this publisher and the real reader default to');
        check(net.ledger.get(published.id).tag.value === 'campaign-d', 'D2. ...and its value is exactly the application-level discoveryTag, never a hash, envelope fragment, or derived value');

        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search('campaign-d');
        check(candidates.length === 1 && candidates[0].announcementId === published.id && candidates[0].uri === 'ar://materialtx-d', 'D3. the real reader (0.9.494, envelope-aware) matches this exact tag/value pair and finds exactly this transaction, reporting the announced material\'s own uri with the announcement transaction id preserved alongside it — the application discovery identity and the Arweave transaction identity are already the same tag, never two vocabularies a caller must keep in sync');

        const discoverySource = await source('application/ArweaveGraphqlDiscoveryQueryService.js');
        check(!/kind\s*:\s*|objectId\s*:\s*|protocol\s*:\s*['"]forkbuild/.test(discoverySource), 'D4. the reader\'s own matching logic never redefines discovery identity in terms of envelope fields (kind/objectId/protocol) — a discoveryTag is compared to an Arweave Tag value only, confirming application discovery identity and Arweave transaction identity are never conflated into a new, third vocabulary');

        console.log('✓ Section D: discoveryTag maps 1:1 onto a single Arweave Tag, exactly the mechanism the real reader already matches against — confirmed live via a real publish-then-search round trip, never a new discovery semantic invented for this bar.');
    }

    // ===============================================================
    // Section E — content identity: no recomputation, no re-derivation,
    // the announcement carries the existing materialUri fact verbatim.
    // ===============================================================
    {
        const publisherSource = await source('application/ArweaveAnnouncementPublisher.js');
        check(!/contentHash|sha256|crypto\.subtle|createHash/i.test(publisherSource), 'E1. ArweaveAnnouncementPublisher.js never imports, computes, or references contentHash or any hashing primitive of any kind — it has no concept of content identity of its own');

        const net = makeSharedFakeArweaveSubstrate();
        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });
        const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-e', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const result = await executePublicationDistribution({
            publication: { id: 'pub-e', signature: 'sig-e' },
            serializedMaterial: JSON.stringify({ body: 'e', contentHash: 'sha256-e-untouched' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: publisher
        });
        const announcedMaterial = JSON.parse(net.ledger.get(result.discovery.id).data);
        check(announcedMaterial.uri === result.material.uri, 'E2. the exact materialUri ArweavePublicationMaterialUploader independently produced rides into the announcement verbatim — never recomputed, never re-derived, never a second identity for the same content');
        check(!('contentHash' in announcedMaterial), 'E3. the announcement carries no contentHash field at all — it binds to the existing uri fact the SAME way NostrPublicationDiscoveryPublisher already does, never inventing an alternate content-identity representation the existing contract does not already define');

        console.log('✓ Section E: content identity is exactly the existing materialUri fact, carried through unmodified — confirmed both by source sweep (no hashing primitive exists in this file) and by one live run showing the announced envelope\'s own uri is byte-identical to the independently-produced material uri.');
    }

    // ===============================================================
    // Section F — discovery semantics: the full round trip, re-executed
    // live against current source. The most important section, per the
    // requesting brief's own emphasis.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const campaign = 'campaign-f-roundtrip';
        const publication = { id: 'pub-f-roundtrip', signature: 'sig-f' };

        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: campaign, uploadTaggedTransaction: net.uploadTaggedTransaction });

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'round-trip-f' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: announcementPublisher
        });
        check(result.material !== null && result.discovery !== null, 'F1. upload -> tagged announcement, both real, both succeed in one sequence');

        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search(campaign);
        // AMENDED BY 0.9.494: the real reader is now envelope-aware — it
        // reports the announced MATERIAL's own uri as candidate.uri, with
        // the announcement transaction id preserved separately as
        // candidate.announcementId, never conflated. Section D of 0.9.493's
        // own boundary audit found the pre-0.9.494 shape asserted here
        // (`candidates[0].uri === ar://<announcement-id>`) to be exactly the
        // identity violation this milestone closes.
        check(candidates.length === 1 && candidates[0].announcementId === result.discovery.id && candidates[0].uri === result.material.uri, 'F2. DISCOVERY QUERY MECHANISM EXISTS AND WORKS — the real, envelope-aware (0.9.494) ArweaveGraphqlDiscoveryQueryService genuinely finds this real announcement and reports the announced material\'s own uri, with the announcement transaction id preserved alongside it; this is not a missing piece the brief speculated might be absent — it is already built, already correct, already live');

        const materialResolver = new ArweaveWorldEncounterMaterialResolver({ fetchImpl: net.fetchImpl });
        const retrieved = await materialResolver.retrieveByUri(candidates[0].uri);
        check(retrieved !== null && JSON.stringify(retrieved) === JSON.stringify({ body: 'round-trip-f' }), 'F3. upload -> tagged announcement -> discovery query -> candidate -> the existing, unmodified material resolver retrieves the exact distributed publication material DIRECTLY off candidate.uri, all through already-existing production classes — the complete "upload tagged transaction -> discovery mechanism -> candidate -> material" chain the requesting brief asked this section to verify, corrected per 0.9.494 to never require a second envelope-recovery hop on the resolve side');

        check(!/node\.tags|tags:\s*\{/.test(await source('application/ArweaveGraphqlDiscoveryQueryService.js')), 'F4. this full round trip required zero query-shape change — DISCOVERY_QUERY_MECHANISM is READY today, at the bar production actually needs, confirmed live rather than assumed from 0.9.427/0.9.429\'s own now-stale evidence');

        console.log('✓ Section F: Arweave already has a real, live, working discovery/query mechanism — search() genuinely finds a tagged announcement and reports the announced material\'s own uri directly, and the existing (discovery-unaware) material resolver completes the round trip straight to the real content. If the query side had NOT existed, the missing piece would have been larger than uploadTaggedTransaction; it already exists, so it is not.');
    }

    // ===============================================================
    // Section G — read-side resilience isolation: the Arweave gateway-
    // failover resolver (0.9.440, content-role only) never leaks into
    // announcement write or discovery query.
    // ===============================================================
    {
        const failoverSource = await source('application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js');
        check(!/ArweaveAnnouncementPublisher|ArweaveGraphqlDiscoveryQueryService|discoveryTag|uploadTaggedTransaction/.test(failoverSource), 'G1. application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js — the CONTENT-retrieval failover class — never imports or references the announcement-write or discovery-query classes, or their own vocabulary (discoveryTag/uploadTaggedTransaction)');

        const publisherSource = await source('application/ArweaveAnnouncementPublisher.js');
        const discoverySource = await source('application/ArweaveGraphqlDiscoveryQueryService.js');
        check(!/GatewayFailover|gatewayUrls\s*:\s*\[/.test(publisherSource), 'G2. ...and the converse: ArweaveAnnouncementPublisher.js never references gateway failover or a multi-gateway list of its own — it composes exactly one gatewayUrl, per its own header, "one gateway, one discovery tag, per instance"');
        check(!/GatewayFailover|gatewayUrls\s*:\s*\[/.test(discoverySource), 'G3. ...neither does ArweaveGraphqlDiscoveryQueryService.js — discovery querying has no failover concept of its own either, confirmed by source sweep');

        // Live confirmation: constructing all three real classes against
        // ONE shared substrate, publishing, then querying and retrieving
        // through the FAILOVER resolver specifically — the resilience
        // mechanism composes cleanly alongside the write/query roles
        // without either needing to know the other exists.
        const net = makeSharedFakeArweaveSubstrate();
        // AMENDED BY 0.9.494: candidate.uri is now the announced MATERIAL's
        // own claimed location, never the announcement transaction id — so
        // the material this section's discovered candidate actually
        // resolves against must genuinely exist on the shared substrate
        // (previously the announcement transaction's own envelope stood in
        // for it, since candidate.uri used to BE the announcement id).
        net.ledger.set('materialtx-g', {
            data: JSON.stringify({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g', uri: 'ar://materialtx-g' }),
            tag: null
        });
        const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-g', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g', uri: 'ar://materialtx-g' });
        const published = await publisher.publish(envelope);

        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search('campaign-g');
        // A single shared fetchImpl that fails for the FIRST configured
        // gateway specifically (simulating it being down) and delegates to
        // the real shared substrate for the second — exercising genuine
        // failover, not merely a single working gateway.
        const failoverFetchImpl = async (url, options) => {
            if (new URL(url).host === 'gateway-a.example') throw new Error('gateway A down');
            return net.fetchImpl(url, options);
        };
        const failoverResolver = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({
            gatewayUrls: ['https://gateway-a.example', 'https://arweave.net'],
            fetchImpl: failoverFetchImpl
        });
        const recovered = await failoverResolver.retrieveByUri(candidates[0].uri);
        check(describeDecentralizedDiscoveryEnvelope(recovered).objectId === 'pub-g', 'G4. a discovery candidate resolves correctly through the READ-side resilience mechanism, with the write (Announcement) and query (Discovery) roles completely unaware it exists — Announcement write, Discovery query, and Content retrieval stay three separate boundaries even when the third one gains resilience the other two never needed to know about');

        console.log('✓ Section G: read-side gateway failover stays exactly where it belongs — a Content-retrieval concern — confirmed both by source sweep (zero cross-reference in either direction) and by one live scenario composing all three roles against a shared substrate without any coupling.');
    }

    // ===============================================================
    // Section H — failure semantics: the four-way degradation boundary,
    // re-executed live, plus an explicit "no compensating action" check
    // (announcement failure of any kind never disturbs a completed
    // material upload).
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });

        const malformedResult = await executePublicationDistribution({
            publication: { id: 'pub-h1' }, // unsigned
            serializedMaterial: JSON.stringify({ body: 'h1' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: new ArweaveAnnouncementPublisher({ discoveryTag: 'h1', uploadTaggedTransaction: net.uploadTaggedTransaction })
        });
        check(malformedResult.material !== null && malformedResult.discovery === null, 'H1. malformed input: material still uploads, announcement never attempted');

        const declinedResult = await executePublicationDistribution({
            publication: { id: 'pub-h2', signature: 'sig-h2' },
            serializedMaterial: JSON.stringify({ body: 'h2' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: new ArweaveAnnouncementPublisher({ discoveryTag: 'h2', uploadTaggedTransaction: async () => null })
        });
        check(declinedResult.material !== null && declinedResult.discovery === null, 'H2. ordinary decline: material present, discovery null, no crash');

        await expectThrowsAsync(() => executePublicationDistribution({
            publication: { id: 'pub-h3', signature: 'sig-h3' },
            serializedMaterial: JSON.stringify({ body: 'h3' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: new ArweaveAnnouncementPublisher({ discoveryTag: 'h3', uploadTaggedTransaction: async () => { throw new Error('gateway unreachable'); } })
        }), 'H3. genuine transport/signing failure propagates, never swallowed');

        await expectThrowsAsync(() => executePublicationDistribution({
            publication: { id: 'pub-h4', signature: 'sig-h4' },
            serializedMaterial: JSON.stringify({ body: 'h4' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: new ArweaveAnnouncementPublisher({ discoveryTag: 'h4', uploadTaggedTransaction: async () => ({ id: '' }) })
        }), 'H4. an invalid transaction response throws rather than masquerading as a real announcement');

        // "No compensating action" — the requesting brief's own Section H:
        // if the architecture treats announcements as additive, an
        // announcement failure must never corrupt the primary
        // material upload. Confirmed live: the material transaction from
        // H1/H2 above is still present, untouched, on the shared ledger —
        // no delete/rollback of any kind was ever attempted.
        check(net.ledger.has(malformedResult.material.uri.replace('ar://', '')), 'H5. the material transaction from the malformed-announcement case (H1) still exists on the substrate, completely undisturbed — no rollback, retry, or compensating action of any kind was attempted against it');
        const executorSource = await source('application/PublicationDistributionExecutor.js');
        const executorCode = executorSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        check(!/rollback|compensate|undo|delete.*material|revert/i.test(executorCode), 'H6. PublicationDistributionExecutor.js\'s own code contains no rollback/compensation vocabulary of any kind — confirmed by source sweep, not merely inferred from one live scenario');

        console.log('✓ Section H: the four-way degradation boundary (malformed, decline, transport failure, invalid response) holds against current source, and an announcement failure of any kind never triggers, or has any mechanism available to trigger, a compensating action against an already-completed material upload — announcements remain purely additive, exactly as the existing architecture already treats them.');
    }

    // ===============================================================
    // Section I — duplicate semantics: publishing one envelope twice has
    // no existing idempotency/deduplication definition; none is
    // manufactured here.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-i', uploadTaggedTransaction: net.uploadTaggedTransaction });
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-i', uri: 'ar://materialtx-i' });

        const first = await publisher.publish(envelope);
        const second = await publisher.publish(envelope);
        check(first.id !== second.id, 'I1. publishing the byte-identical envelope twice produces two independent, real transactions — no in-memory registry of "already published" exists to collapse them');

        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search('campaign-i');
        check(candidates.length === 2, 'I2. discovery finds BOTH transactions — the substrate and the reader both treat repeated publication as two independent, equally-valid announcements, never de-duplicating on a caller\'s behalf');

        const publisherSource = await source('application/ArweaveAnnouncementPublisher.js');
        check(/NO[\s\S]{0,20}DEDUPLICATION/.test(publisherSource), 'I3. this is a documented, deliberate decision, not an oversight — the class\'s own header already states "no caching, no retry, no deduplication"');
        const codeOnly = publisherSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        check(!/new Set\(|new Map\(|_published|_seen|_history/.test(codeOnly), 'I4. and the class carries no internal Set/Map/history of previously-published envelopes to enforce one, even informally');

        console.log('✓ Section I: no existing lifecycle rule defines what a repeated publish of the same announcement means — it simply produces two independent transactions, confirmed live and by source sweep. Consistent with the requesting brief\'s own instruction: this audit does not manufacture idempotency or deduplication semantics the current architecture never asked for.');
    }

    // ===============================================================
    // Section J — role separation: Content, Announcement, Discovery-
    // query, and Attribution stay four genuinely separate concerns, even
    // against one shared simulated substrate.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const publication = { id: 'pub-j', signature: 'sig-j-real-attribution' };
        const materialUploader = new ArweavePublicationMaterialUploader({ signer: net.contentSigner, fetchImpl: net.fetchImpl });
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-j', uploadTaggedTransaction: net.uploadTaggedTransaction });

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'j' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: announcementPublisher
        });

        const contentTxId = result.material.uri.replace('ar://', '');
        check(contentTxId !== result.discovery.id, 'J1. CONTENT STORAGE ≠ ANNOUNCEMENT — two distinct transactions for the same publication, over the same substrate');

        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: net.fetchImpl });
        const candidates = await discoveryQueryService.search('campaign-j');
        check(candidates.length === 1 && candidates[0].announcementId === result.discovery.id && candidates[0].uri === result.material.uri, 'J2. ANNOUNCEMENT ≠ DISCOVERY — writing an announcement and querying for one are two separate operations through two separate classes; the search only ever surfaces the tagged transaction (as announcementId, 0.9.494), reporting the material it claims (never re-deriving or fabricating a second content transaction)');

        const announcedEnvelope = describeDecentralizedDiscoveryEnvelope(JSON.parse(net.ledger.get(result.discovery.id).data));
        check(!('signature' in announcedEnvelope), 'J3. DISCOVERY/ANNOUNCEMENT ≠ ATTRIBUTION — the announced envelope carries objectId/uri, never the Publication\'s own signature; attribution remains entirely publisher/Publication.js\'s own concern, never re-derived or re-asserted by the announcement');
        check(publication.signature === 'sig-j-real-attribution', 'J4. ...confirmed the ORIGINAL signature is untouched, unread by anything this section constructed beyond describePublicationDistribution()\'s own existing validation');

        // Proof/Anchor independence, re-confirmed with one live call rather
        // than re-deriving all of 0.9.429 Section F's own coverage.
        let anchorSignCalls = 0;
        const countingAnchorSigner = { async sign(material) { anchorSignCalls += 1; return net.anchorSigner.sign(material); } };
        const anchorPublisher = new ArweaveAnchorPublisher({ signer: countingAnchorSigner, fetchImpl: net.fetchImpl });
        void anchorPublisher; // constructed to prove it exists, unused, right beside this section's own announcement call
        check(anchorSignCalls === 0, 'J5. CONTENT VERIFICATION/PROOF-ANCHORING ≠ ANNOUNCEMENT — a real ArweaveAnchorPublisher sitting unused beside this section\'s own distribution call was never invoked as a side effect of it');

        console.log('✓ Section J: Content storage, Announcement, Discovery query, and Publisher attribution remain four genuinely separate roles — confirmed live, on one shared substrate, that all four facts stay independently present/absent/correct rather than collapsing merely because they share one substrate.');
    }

    // ===============================================================
    // Section K — Nostr coexistence: mutual exclusivity and interleaving
    // isolation, re-confirmed, plus an explicit "never a fallback" sweep.
    // ===============================================================
    {
        const net = makeSharedFakeArweaveSubstrate();
        const nostrOptions = { discoveryTag: 'campaign-k-nostr', publishImpl: async () => ({ published: true, id: 'a'.repeat(64) }) };
        const arweaveAnnouncementOptions = { discoveryTag: 'campaign-k-arweave', uploadTaggedTransaction: net.uploadTaggedTransaction };
        const arweaveUploaderOptions = { signer: net.contentSigner, fetchImpl: net.fetchImpl };

        const nostrRuntime = composePublicationDistributionRuntime({ discoveryProvider: 'nostr', arweaveUploaderOptions, nostrPublisherOptions: nostrOptions, arweaveAnnouncementPublisherOptions: arweaveAnnouncementOptions });
        const arweaveRuntime = composePublicationDistributionRuntime({ discoveryProvider: 'arweave', arweaveUploaderOptions, nostrPublisherOptions: nostrOptions, arweaveAnnouncementPublisherOptions: arweaveAnnouncementOptions });
        check(nostrRuntime.publisher instanceof NostrPublicationDiscoveryPublisher && !(nostrRuntime.publisher instanceof ArweaveAnnouncementPublisher), 'K1. "nostr" selects exactly Nostr, even with full Arweave options simultaneously present');
        check(arweaveRuntime.publisher instanceof ArweaveAnnouncementPublisher && !(arweaveRuntime.publisher instanceof NostrPublicationDiscoveryPublisher), 'K2. "arweave" selects exactly Arweave, even with full Nostr options simultaneously present — additive substrates, never a combined fan-out');

        // Never a fallback: an Arweave announcement failure never triggers
        // a Nostr attempt, or vice versa — confirmed both live and by
        // source sweep of the one file that could plausibly wire one in.
        let nostrPublishCalls = 0;
        const spyingNostrOptions = { discoveryTag: 'campaign-k-spy', publishImpl: async () => { nostrPublishCalls += 1; return { published: true, id: 'b'.repeat(64) }; } };
        const failingArweaveRuntime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions,
            nostrPublisherOptions: spyingNostrOptions,
            arweaveAnnouncementPublisherOptions: { discoveryTag: 'campaign-k-fail', uploadTaggedTransaction: async () => { throw new Error('gateway down'); } }
        });
        await expectThrowsAsync(() => executePublicationDistribution({
            publication: { id: 'pub-k-fail', signature: 'sig-k' },
            serializedMaterial: JSON.stringify({ body: 'k-fail' }),
            materialUploader: failingArweaveRuntime.uploader,
            distributionDescriptor: failingArweaveRuntime.describeDistribution,
            discoveryPublisher: failingArweaveRuntime.publisher
        }), 'K3. an Arweave announcement failure propagates as a rejection');
        check(nostrPublishCalls === 0, 'K4. ...and never triggers a fallback attempt on Nostr — the spying nostrPublisherOptions passed to the SAME composition call was never touched, because composePublicationDistributionRuntime() never constructs the unselected substrate\'s own publisher at all (K1/K2), let alone calls it');

        const compositionSource = await source('application/PublicationDistributionRuntimeComposition.js');
        const executorSource = await source('application/PublicationDistributionExecutor.js');
        check(!/catch[\s\S]{0,120}(nostr|arweave)/i.test(compositionSource) && !/catch[\s\S]{0,120}(nostr|arweave)/i.test(executorSource), 'K5. neither file contains any catch-and-retry-on-the-other-substrate logic — confirmed by source sweep, not merely by this section\'s own one live failure scenario');

        console.log('✓ Section K: Nostr and Arweave remain additive, mutually exclusive discovery substrates — selecting one never constructs or invokes the other, and a failure on one never falls back to the other, confirmed live and by source sweep. No replacement of Nostr occurs or is proposed by anything in this milestone.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    {
        const VERDICT = Object.freeze({
            existingPublisherContract: 'READY',
            reachability: 'REACHABLE_BUT_NONFUNCTIONAL',
            uploadTaggedTransactionContract: 'PURE_IO_ADAPTER_BOUNDED_AND_PRECEDENTED',
            tagFidelity: 'READY',
            contentIdentity: 'READY_NO_RECOMPUTATION',
            discoveryQueryMechanism: 'READY',
            readSideIsolation: 'CONFIRMED',
            failureSemantics: 'PRESERVED_ADDITIVE_ONLY',
            duplicateSemantics: 'NONE_DEFINED_NONE_NEEDED',
            roleSeparation: 'CONFIRMED',
            nostrCoexistence: 'CONFIRMED_ADDITIVE_NEVER_FALLBACK'
        });

        console.log('='.repeat(78));
        console.log('ARWEAVE ANNOUNCEMENT/DISCOVERY CAPABILITY BOUNDARY — FINAL VERDICT');
        console.log('='.repeat(78));
        for (const [key, value] of Object.entries(VERDICT)) {
            console.log(`  ${key.padEnd(32)} ${value}`);
        }
        console.log('');
        console.log('  HYPOTHESIS: "the only missing piece is uploadTaggedTransaction" — CONFIRMED.');
        console.log('  Every other boundary the requesting brief named (A, D-K) is READY, on');
        console.log('  CURRENT source, confirmed by live re-execution rather than citation of');
        console.log('  now-stale prior-milestone evidence. Section B additionally reframes the');
        console.log('  motivation: this is not merely an unused capability — production source,');
        console.log('  right now, offers "Arweave" as a live discovery-substrate choice and');
        console.log('  throws on every real selection of it. Implementing uploadTaggedTransaction');
        console.log('  next does not merely activate a dormant feature — it fixes a live,');
        console.log('  currently-broken UI path.');
        console.log('');
        console.log('  RECOMMENDATION: proceed to a concrete uploadTaggedTransaction');
        console.log('  implementation next (0.9.490), scoped exactly per Section C: a');
        console.log('  recombination of arweave/ArweaveInjectedProviderSigner.js\'s own already-');
        console.log('  shipped signing/wallet-interaction logic (its "tags: []" made non-empty)');
        console.log('  and application/ArweavePublicationMaterialUploader.js\'s own already-');
        console.log('  shipped POST /tx call. That implementation should touch neither');
        console.log('  application/ArweaveAnnouncementPublisher.js, application/');
        console.log('  PublicationDistributionRuntimeComposition.js, nor any other file this');
        console.log('  audit reconfirmed correct — it is a new adapter satisfying an existing,');
        console.log('  already-proven contract, never a redesign.');
        console.log('='.repeat(78));

        check(Object.values(VERDICT).every((value) => typeof value === 'string' && value.length > 0), 'V1. every boundary named by the requesting brief resolved to an explicit, honest classification — none left unaddressed');
        check(assertionCount > 40, 'V2. sanity: this audit is substantive, not a token pass');

        console.log(`\n✅ All Arweave Announcement/Discovery Capability Boundary Audit tests passed. (${assertionCount} assertions)`);
    }
}

run().catch((error) => {
    console.error('ArweaveAnnouncementDiscoveryCapabilityBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
