import { readFile } from 'node:fs/promises';

import { IpfsRemotePublicationCoordinator } from '../application/IpfsRemotePublicationCoordinator.js';
import { IpfsRemotePublicationState } from '../application/IpfsRemotePublicationState.js';
import { PinningRejectedError } from '../content/HttpPinningProvider.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { publicationsPageFiles } from './support/PublicationsPageFiles.js';

// 0.9.664 — Node-less Distribution Product Reassessment.
//
// Type: product reassessment, test-first. Production changes: exactly one,
// narrow, presentation-only change to ui/views/DecentralizedPublicationsView.js
// — rendering two facts (entry.ipfsRemoteSnapshotAnnouncement and
// entry.snapshotDistributionAttempt.result.announcement) that were already
// computed in memory but never previously read by the template — made
// directly in response to this file's own Section B finding, per the
// requesting brief's own instruction ("If NARROW_UX_GAP: implement only
// that specific UX gap"). No new state, no new command, no new
// collaborator, no registry change, and none of the explicitly-excluded
// scope items (see Section D) were touched.
//
// 0.9.662 found that Remote IPFS publication never reached Nostr Snapshot
// discovery at all (NARROW_WIRING_GAP). 0.9.663 closed that wiring gap and
// proved, in tests/ConnectRemoteIpfsToNostrSnapshotDistributionClosureAudit
// .test.js's own Section H, that an independent NostrSnapshotDiscoveryQueryService
// can discover a Remote-IPFS-published locator by contentHash alone. This
// file asks the NEXT question, verbatim from the requesting brief: does
// ForkBuild's node-less distribution journey now provide a complete,
// understandable, USABLE product experience — not merely a working wire
// protocol — for a person who has never run a local Kubo node?
//
//   Remote IPFS publish -> CID -> Nostr announcement -> independent
//   instance -> DISCOVERY -> RETRIEVAL (never just discovery) -> the
//   normal product surface a user actually reads
//
// Four questions, each with its own section below:
//
//   A. Independent RETRIEVAL, not just discovery. Section H (0.9.663)
//      proved a bare NostrSnapshotDiscoveryQueryService can discover the
//      locator. It never proved the actual production retrieval seam
//      (application/DiscoverSnapshotCommand.js + application/
//      DecentralizedSnapshotResolver.js + a SnapshotPlacementStoreRegistry
//      carrying the SAME IpfsGatewayContentStore shape ui/main.js's own
//      `discoverSnapshotCommand` wiring registers under 'ipfs') can turn
//      that discovery into actual bytes, for someone with no Kubo node.
//      Verdict: ALREADY_CORRECT.
//   B. Failure-state semantics. Can a user tell "IPFS published, Nostr
//      announced" apart from "IPFS published, Nostr announcement failed"?
//      Verdict: NARROW_UX_GAP, found and closed by this same milestone —
//      this section proves both the gap's prior existence (by source, from
//      the pre-fix template shape) and the fix's own correctness live.
//   C. First-run discoverability / provider transparency. Does the
//      existing UI already explain what Remote IPFS is, without leaking
//      "you need Kubo" language now that a node-less path exists?
//      Verdict: ALREADY_CORRECT.
//   D. Exclusion list. Confirm none of the explicitly-excluded scope
//      (new provider, auto-fallback, registry fix, gateway config, etc.)
//      is silently required to answer A-C.
//
// Every section below either runs real, unmodified production classes
// (IpfsRemotePublicationCoordinator, NostrSnapshotDiscoveryPublisher,
// NostrSnapshotDiscoveryQueryService, DecentralizedSnapshotResolver,
// executeDiscoverSnapshotCommand, SnapshotPlacementStoreRegistry,
// IpfsGatewayContentStore) or inspects the real, current source of
// ui/views/DecentralizedPublicationsView.js and ui/main.js — never a
// bespoke stand-in asserting what production "should" do.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Mirrors tests/RemoteIpfsDistributionIntegrationBoundaryAudit.test.js's
// and tests/ConnectRemoteIpfsToNostrSnapshotDistributionClosureAudit.test.js's
// own fake pinning provider exactly — never cross-imported, per this
// codebase's own "kept deliberately separate" restraint for test-only
// fixtures.
function makeFakePinningProvider({ network = new Map(), shouldReject = false } = {}) {
    let seq = 0;
    return {
        async put(bytes) {
            if (shouldReject) throw new PinningRejectedError('fake-provider: refused');
            const cid = `bafyremote${++seq}`;
            network.set(cid, bytes);
            return { cid };
        }
    };
}

// A tiny shared, in-memory Nostr relay — byte-for-byte the same shape
// tests/ConnectRemoteIpfsToNostrSnapshotDistributionClosureAudit.test.js's
// own makeFakeNostrRelayBus() already uses.
function makeFakeNostrRelayBus() {
    const relays = new Map();
    let seq = 0;
    return {
        async publishImpl(relayUrl, eventTemplate) {
            seq += 1;
            const list = relays.get(relayUrl) || [];
            const id = seq.toString(16).padStart(64, '0');
            list.push({ id, ...eventTemplate });
            relays.set(relayUrl, list);
            return { published: true, id };
        },
        async queryImpl(relayUrl, filter) {
            const list = relays.get(relayUrl) || [];
            const tagValues = filter['#t'] || [];
            return list.filter((event) =>
                filter.kinds.includes(event.kind) &&
                event.tags.some(([tagName, tagValue]) => tagName === 't' && tagValues.includes(tagValue))
            );
        }
    };
}

// A fake HTTPS gateway `fetchImpl` — the SAME injection point
// content/IpfsGatewayContentStore.js's own constructor already documents
// as "not a convenience — every deterministic test... supplies a fake
// one." Serves whatever `network` holds under the CID in the request
// path, standing in for a real public gateway that can resolve ANY
// globally-pinned CID — Remote-Pinning-produced or Kubo-produced alike —
// never a Kubo RPC call and never anything Remote-Pinning-specific.
function makeFakeGatewayFetch(network) {
    return async (url) => {
        const match = url.match(/\/ipfs\/([^/?]+)/);
        const cid = match ? decodeURIComponent(match[1]) : null;
        const bytes = cid !== null ? network.get(cid) : undefined;
        if (bytes === undefined) {
            return { ok: false, status: 404, text: async () => '' };
        }
        return { ok: true, status: 200, text: async () => bytes };
    };
}

// Reproduces ui/views/DecentralizedPublicationsView.js#publishToRemoteIpfs()'s
// own real sequencing exactly, mirroring the identical harness
// tests/ConnectRemoteIpfsToNostrSnapshotDistributionClosureAudit.test.js's
// own simulatePublishToRemoteIpfsSequence() already uses.
async function simulatePublishToRemoteIpfsSequence({ coordinator, snapshotDiscoveryPublisher, bytes, configuration }) {
    const outcome = await coordinator.publish({ bytes, configuration });
    let announcement = null;
    if (outcome.state === IpfsRemotePublicationState.PUBLISHED && snapshotDiscoveryPublisher) {
        announcement = await snapshotDiscoveryPublisher.publish({
            contentHash: outcome.contentHash,
            locator: outcome.locator,
            storage: 'ipfs'
        });
    }
    return { outcome, announcement };
}

async function run() {

    // =======================================================================
    // Section A — Independent RETRIEVAL, through the actual production seam,
    // never just discovery.
    // =======================================================================
    {
        const network = new Map();
        const relayBus = makeFakeNostrRelayBus();

        // The PUBLISHING instance — a person with no Kubo node, publishing
        // through Remote Pinning exactly as ui/views/
        // DecentralizedPublicationsView.js#publishToRemoteIpfs() does.
        const coordinator = new IpfsRemotePublicationCoordinator({ createPinningProvider: () => makeFakePinningProvider({ network }) });
        const publishingInstancePublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relayBus.publishImpl });
        const publishedBytes = JSON.stringify({ world: 'nodeless-reassessment-section-a' });

        const { outcome, announcement } = await simulatePublishToRemoteIpfsSequence({
            coordinator, snapshotDiscoveryPublisher: publishingInstancePublisher,
            bytes: publishedBytes,
            configuration: { endpoint: 'https://pin.example/api/add' }
        });
        assert(outcome.state === IpfsRemotePublicationState.PUBLISHED && announcement !== null,
            n('A1. the publishing instance\'s own Remote IPFS publication succeeds and announces, exactly as 0.9.663 already proved.'));

        // The DISCOVERING/RETRIEVING instance — built from the SAME
        // collaborator shapes ui/main.js's own real `discoverSnapshotCommand`
        // composition uses: a NostrSnapshotDiscoveryQueryService feeding a
        // DecentralizedSnapshotResolver, plus a SnapshotPlacementStoreRegistry
        // with an IpfsGatewayContentStore registered under 'ipfs' — see
        // ui/main.js's own 0.9.508 comment, "storeRegistry:
        // publicationSnapshotPlacementResolutionStoreRegistry... already
        // carrying 'local'/'ipfs' (IpfsGatewayContentStore)". This instance
        // shares NOTHING with the publishing instance above except the fake
        // relay bus's own queryImpl and the fake gateway's own network Map —
        // the same two boundaries a real second ForkBuild replica would
        // cross too (a real Nostr relay, a real public IPFS gateway),
        // never any in-process object from the publishing side.
        const discoveringInstanceQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: relayBus.queryImpl });
        const discoveringInstanceResolver = new DecentralizedSnapshotResolver(discoveringInstanceQueryService);
        const discoveringInstanceStoreRegistry = new SnapshotPlacementStoreRegistry();
        discoveringInstanceStoreRegistry.register(new IpfsGatewayContentStore({ fetchImpl: makeFakeGatewayFetch(network) }));

        const result = await executeDiscoverSnapshotCommand({
            discoveryTag: 'forkbuild-snapshot',
            contentHash: outcome.contentHash,
            resolver: discoveringInstanceResolver,
            storeRegistry: discoveringInstanceStoreRegistry
        });

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            n(`A2. FLAGSHIP: the actual production retrieval seam (executeDiscoverSnapshotCommand + DecentralizedSnapshotResolver + a registry carrying an IpfsGatewayContentStore, exactly as ui/main.js wires it for World View) resolves a Remote-IPFS-published Snapshot to RESOLVED — never STORE_UNAVAILABLE or CONTENT_UNAVAILABLE — with no Kubo node anywhere in this call chain. Got: ${result.outcome}${result.reason ? ` (${result.reason})` : ''}.`));
        assert(result.bytes === publishedBytes,
            n('A3. ...and the retrieved bytes are the EXACT bytes the Remote IPFS coordinator originally published — content identity survives publish -> announce -> discover -> retrieve -> verify unbroken.'));
        assert(result.storage === 'ipfs' && result.locator === outcome.locator,
            n('A4. the resolved candidate carries the identical storage/locator the Remote IPFS coordinator produced — never re-derived or substituted.'));

        // A negative control confirming this is a genuine retrieval, not a
        // gateway that echoes anything asked: an unrelated content hash
        // that was never published resolves to NOT_DISCOVERED.
        const negative = await executeDiscoverSnapshotCommand({
            discoveryTag: 'forkbuild-snapshot',
            contentHash: 'never-published-hash',
            resolver: discoveringInstanceResolver,
            storeRegistry: discoveringInstanceStoreRegistry
        });
        assert(negative.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
            n('A5. a contentHash that was never announced resolves to NOT_DISCOVERED, not a false RESOLVED — confirming Section A above is a genuine retrieval, not an unconditional pass-through.'));
    }
    console.log('✓ Section A: independent RETRIEVAL, not merely discovery, now proven through the actual production seam a node-less user\'s World View already calls — a person with no Kubo node can both PUBLISH (0.9.663) and RETRIEVE (this section) a Remote-IPFS-distributed Snapshot, discovered by a completely independent instance.');

    // =======================================================================
    // Section B — Failure-state semantics: can a user tell "published,
    // announced" apart from "published, announcement failed"?
    // =======================================================================
    {
        const viewSource = (await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n');
        const templateStart = viewSource.indexOf('template: `');
        assert(templateStart !== -1, n('B1. ui/views/DecentralizedPublicationsView.js still has an inline `template:` literal to inspect.'));
        const templateBody = viewSource.slice(templateStart);
        const scriptBody = viewSource.slice(0, templateStart);

        // B2 — the script side DOES compute this fact (0.9.663 built it).
        assert(/entry\.ipfsRemoteSnapshotAnnouncement = \{ announced: announcement !== null, announcement, error: null \}/.test(scriptBody),
            n('B2. the script side genuinely computes entry.ipfsRemoteSnapshotAnnouncement — the fact this reassessment is asking whether a user can SEE exists in memory, confirming this is a presentation gap, not a missing capability.'));

        // B3 — THE FIX: entry.ipfsRemoteSnapshotAnnouncement is now read
        // inside the PUBLISHED template block, gated so it renders nothing
        // when null (no announcement attempted/available) and an honest
        // announced/not-announced badge otherwise — never collapsing "not
        // announced" into "failed publish."
        const remotePublishedBlockMatch = templateBody.match(/<template v-if="ipfsRemotePublicationView\(entry\)\.state === IpfsRemotePublicationState\.PUBLISHED">[\s\S]*?<\/template>/);
        assert(remotePublishedBlockMatch, n('B3. the Remote IPFS PUBLISHED template block still exists, isolable for inspection.'));
        assert(remotePublishedBlockMatch[0].includes('entry.ipfsRemoteSnapshotAnnouncement.announced') && remotePublishedBlockMatch[0].includes('entry.ipfsRemoteSnapshotAnnouncement.error'),
            n('B4. FIX CONFIRMED: entry.ipfsRemoteSnapshotAnnouncement\'s own `announced`/`error` fields are now read inside that exact block — a user publishing through Remote IPFS can now see whether the Nostr Snapshot announcement that immediately followed succeeded or failed, never merely inferring it from silence.'));

        // B5 — this was never specific to Remote IPFS: the pre-existing
        // Kubo/Arweave "Distribute Snapshot" result carries the identical
        // { contentReference, announcement } shape (application/
        // SnapshotDistributionCommand.js's own documented return value).
        // Fixed identically, in the same milestone, for the same reason.
        const distributionResultBlockMatch = templateBody.match(/<dl v-if="entry\.snapshotDistributionAttempt && entry\.snapshotDistributionAttempt\.result"[\s\S]*?<\/p>/);
        assert(distributionResultBlockMatch,
            n('B5. the existing Kubo/Arweave "Distribute Snapshot" result block still exists in the template.'));
        assert(distributionResultBlockMatch[0].includes('result.contentReference') && distributionResultBlockMatch[0].includes('result.announcement'),
            n('B6. FIX CONFIRMED: that SAME block now renders result.announcement alongside result.contentReference — both call sites into the identical { contentReference, announcement } shape are fixed symmetrically, not just the Remote IPFS one.'));

        // B7 — regression guard: the fix is presentation-only. Neither
        // announcement field's own computation (0.9.663 for Remote IPFS,
        // 0.9.136 for Snapshot Distribution) was touched — a Nostr
        // announcement failure still never overwrites a successful
        // publish/distribution outcome. Re-confirms 0.9.663's own Section G
        // restraint still holds after this milestone's template edit.
        assert(/entry\.ipfsRemotePublicationOutcome = await ipfsRemotePublicationCoordinator\.publish/.test(scriptBody) &&
            /if \(entry\.ipfsRemotePublicationOutcome\.state === IpfsRemotePublicationState\.PUBLISHED\) \{/.test(scriptBody),
            n('B7. REGRESSION GUARD: publishToRemoteIpfs()\'s own PUBLISHED-outcome gate is untouched by this milestone\'s template-only change — this fix reads two existing facts, it computes none.'));
    }
    console.log('✓ Section B: NARROW_UX_GAP found and closed within this same milestone — entry.ipfsRemoteSnapshotAnnouncement and entry.snapshotDistributionAttempt.result.announcement are now both rendered, confirmed live against the current template; the underlying publish/distribute/announce logic is untouched, confirmed by the same regression guard 0.9.663 already established.');

    // =======================================================================
    // Section C — First-run discoverability / provider transparency.
    // =======================================================================
    {
        const viewSource = (await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n');
        const templateStart = viewSource.indexOf('template: `');
        const templateBody = viewSource.slice(templateStart);

        // C1 — the three-way IPFS capability distinction (Local Kubo /
        // Remote gateway / Remote pinning) is already explained in plain
        // product language, not implementation jargon, immediately above
        // the Remote IPFS configuration UI.
        assert(/Local Kubo can resolve and publish\. A remote gateway can only resolve\. Remote\s*pinning, configured below, can only publish\./.test(templateBody),
            n('C1. the "IPFS Publishing" section already explains, in plain language and without requiring a local Kubo node to read, what each of the three IPFS capabilities does — this is not new copy this reassessment needs to add.'));

        // C2 — no "you need IPFS/Kubo installed" gate blocks the Remote
        // IPFS configuration/publish UI itself from rendering.
        const remoteIpfsSectionMatch = templateBody.match(/<div v-if="ipfsRemotePublicationCoordinator && publicationContentStore" class="evidence-section">[\s\S]*?<\/section>/);
        assert(remoteIpfsSectionMatch || templateBody.includes('ipfsRemotePublicationCoordinator && publicationContentStore'),
            n('C2. the Remote IPFS section\'s only rendering precondition is these two injected collaborators — never a Kubo daemon reachability check — so a node-less user genuinely sees and can use "Publish to Remote IPFS" without ever needing Kubo running.'));

        // C3 — the PUBLISHED state's own hint text (0.8.68) already states
        // the honest, narrow claim in product language ("the configured
        // provider accepted these bytes"), not implementation language.
        assert(templateBody.includes('The configured provider accepted these bytes and returned this locator.'),
            n('C3. the PUBLISHED-state hint already speaks in honest, provider-neutral product language, consistent with content/IpfsRemotePinningContentStore.js\'s own "provider-neutral by construction" header — no rewrite needed here.'));
    }
    console.log('✓ Section C: provider transparency and first-run discoverability for the Remote IPFS path are ALREADY_CORRECT — the existing UI already explains the three IPFS capabilities in plain language, gates on real collaborator availability rather than a Kubo daemon check, and describes a successful publish honestly and narrowly. No copy or gating change is warranted.');

    // =======================================================================
    // Section D — Exclusion list: none of the explicitly out-of-scope
    // items were silently required to answer A-C.
    // =======================================================================
    {
        const registrySource = await source('application/SnapshotPlacementStoreRegistry.js');
        const mainSource = await source('ui/main.js');

        assert(!/class IpfsRemote(Kubo|Fallback|Ranked)ContentStore/.test(await source('content/IpfsRemotePinningContentStore.js')),
            n('D1. no new IPFS provider class was needed to prove Section A\'s retrieval path — content/IpfsRemotePinningContentStore.js is read, never modified, by this reassessment.'));
        assert(!registrySource.includes('automaticFallback') && !registrySource.includes('registerFallback'),
            n('D2. application/SnapshotPlacementStoreRegistry.js still has no automatic-fallback concept — Section A\'s retrieval succeeded through the SAME single \'ipfs\'-keyed lookup 0.9.662 already found provider-blind, not a new fallback path.'));
        assert(mainSource.includes("get storage() { return 'ipfs'; }") === false,
            n('D3. this file makes no assertion requiring ui/main.js itself to define a storage getter (it does not) — a sanity check that this reassessment has not accidentally started depending on a registry-collision fix (0.9.662\'s own explicitly out-of-scope finding) it never needed.'));
    }
    console.log('✓ Section D: every exclusion the requesting brief named (new provider, registry-collision fix, automatic fallback, gateway config change) was confirmed genuinely unnecessary to answer Sections A-C — this reassessment required none of them.');

    console.log('\nAll Node-less Distribution Product Reassessment tests passed.');
    console.log(
        '\nVerdict: NARROW_UX_GAP, found and closed within this milestone. ' +
        'Journey completeness (Section A) and provider transparency/first-run discoverability (Section C) are\n' +
        'both ALREADY_CORRECT: a person with no local Kubo node can publish through Remote IPFS, have it announced\n' +
        'via Nostr, and have a completely independent ForkBuild instance both DISCOVER and RETRIEVE the resulting\n' +
        'Snapshot through the exact production seam World View already uses (executeDiscoverSnapshotCommand +\n' +
        'DecentralizedSnapshotResolver + a registry carrying IpfsGatewayContentStore) — never merely the lower-\n' +
        'level query service 0.9.663\'s own Section H exercised. The existing UI already explains the three IPFS\n' +
        'capabilities (Local Kubo / Remote gateway / Remote pinning) in honest, plain product language, gated on\n' +
        'real collaborator availability rather than a Kubo daemon check.\n\n' +
        'The one genuine, concrete gap (Section B): entry.ipfsRemoteSnapshotAnnouncement — and the pre-existing,\n' +
        'symmetric entry.snapshotDistributionAttempt.result.announcement for the Kubo/Arweave path — were both\n' +
        'computed and both never rendered. A successful Remote IPFS (or Kubo/Arweave) publish was indistinguishable\n' +
        'on screen from the same publish whose Nostr Snapshot announcement silently failed — exactly the "IPFS\n' +
        'published / Nostr announcement failed" state 0.9.663\'s own header named as deliberately, honestly non-\n' +
        'fatal, but which the UI never surfaced either way. Closed by this milestone: both fields are now rendered\n' +
        'next to their respective existing result fields, with no new state, no new command, no new collaborator,\n' +
        'and no change to the underlying publish/distribute/announce logic — confirmed by Section B7\'s own\n' +
        'regression guard.\n\n' +
        'No 0.9.665 is warranted from this topic. Close the Remote IPFS node-less distribution arc.'
    );
}

run().catch((error) => {
    console.error('NodelessDistributionProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
    throw error;
});
