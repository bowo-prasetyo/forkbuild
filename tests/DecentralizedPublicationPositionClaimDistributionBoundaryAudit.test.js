import { readFile } from 'node:fs/promises';

import { resolveSnapshotWorldPositionClaim } from '../application/snapshot/placement/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/snapshot/placement/SnapshotWorldPositionClaimOutcome.js';
import { describeSnapshotDiscoveryEnvelope } from '../core/SnapshotDiscoveryEnvelope.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { ArweaveSnapshotDiscoveryPublisher } from '../application/arweave/ArweaveSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { executeSnapshotDistributionCommand } from '../application/snapshot/SnapshotDistributionCommand.js';
import { worldViewFiles, worldNavigationSessionFiles, ownPublicationPanelFiles, mainFiles } from './support/SourceFileGroups.js';

// 0.9.565 — Decentralized Publication Position Claim Distribution Boundary
// Audit.
//
// Type: test-only boundary audit. Production changes: NONE.
//
// A user's report, checked line by line against the current tree rather
// than taken on its own word: ForkBuild already has BOTH ends of a
// "decentralized position claim" feature — 0.9.171/0.9.498 taught
// `core/SnapshotDiscoveryEnvelope.js` and both Snapshot discovery
// publishers to carry an OPTIONAL `publicationId`/`claimedPosition` pair,
// and 0.9.172 built a fully production-wired consumer
// (`application/snapshot/placement/SnapshotWorldPositionClaim.js`,
// `ui/components/OwnPublicationPanel.js#useClaimedSnapshotPosition()`) —
// but the one production call site that actually PUBLISHES a Snapshot
// distribution (`ui/views/WorldView.js#distributeWorldEncounterSnapshot()`,
// through `application/snapshot/SnapshotDistributionCommand.js`) never supplies
// either field. This audit traces that boundary exactly: which file drops
// the claim, what the wire already supports, and whether the gap is a
// missing product wire (small) or a missing architectural capability
// (large).
//
// Nine lettered sections, each checked against real source or a real,
// live object graph — never prose carried over without re-verifying it:
//
//   A — Authoritative position source. `WorldNavigationSession#
//       getPlacementInfoForPublication(publicationId)` already exists and
//       already returns a `{ placementId, publicationId, position }`
//       shape a publisher-side caller could hand straight to a discovery
//       publisher's own `claimedPosition` argument.
//   B — The exact production boundary. `application/
//       SnapshotDistributionCommand.js#runSnapshotDistribution()` calls
//       `discoveryPublisher.publish()` with only `contentHash`/`locator`/
//       `storage` — never `publicationId`/`claimedPosition` — and neither
//       `executeSnapshotDistributionCommand()`'s own parameter list nor
//       its caller's own single production call site,
//       `ui/views/WorldView.js#distributeWorldEncounterSnapshot()`,
//       carries a Publication identity or a position past this point at
//       all.
//   C — Announcement contracts already support the claim. Both Snapshot
//       discovery publishers (Nostr, Arweave) already accept and forward
//       optional `publicationId`/`claimedPosition` — proven live, not
//       merely read from a header comment.
//   D — Nostr path, live. A real `NostrSnapshotDiscoveryPublisher` +
//       `NostrSnapshotDiscoveryQueryService`, wired through a real,
//       in-memory relay, round-trips a claim end to end when a caller
//       supplies one — and the current production composition
//       (`ui/main.js`) never supplies one, because `executeSnapshotDistributionCommand()`
//       has no parameter to carry it through.
//   E — Arweave path, structural. The Arweave discovery-ANNOUNCEMENT
//       publisher (`application/arweave/ArweaveSnapshotDiscoveryPublisher.js`)
//       supports the identical claim fields, but production
//       (`ui/main.js`) never even constructs one for Snapshot
//       distribution — only `ArweaveContentStore` (placement) and
//       `ArweaveSnapshotDiscoveryQueryService` (read-side query) are
//       wired. Arweave-substrate discovery WRITES are entirely unwired
//       in production today, independent of the claim question.
//   F — Identity binding holds, and is never exercised in production
//       today. `resolveSnapshotWorldPositionClaim()`'s own
//       `publicationId`-bound comparison is re-proven live (two
//       Publications, one shared `contentHash`, correctly independent
//       claims/mismatches) — and, separately, proven that the CURRENT
//       production wire, carrying no `publicationId` at all, can only
//       ever yield `ABSENT`, never `CLAIMED` or `MISMATCHED`.
//   G — Authority boundary intact. Claim consumption remains gated behind
//       a person's own explicit action; nothing in the distribution
//       command, the publishers, or the query services ever turns a
//       claim into a `WorldPlacement`/`PlacementRecord` automatically.
//   H — Existing consumer is already production-ready. `ui/components/
//       OwnPublicationPanel.js`'s own `useClaimedSnapshotPosition()` is a
//       real, wired call site for `resolveSnapshotWorldPositionClaim()` —
//       strong structural evidence the gap is upstream wiring, not a
//       missing subsystem.
//   I — Classification and the smallest closing seam, named precisely.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function freezePosition(x, y, z) {
    return Object.freeze({ x, y, z });
}

async function run() {

    // =======================================================================
    // Section A — Authoritative position source already exists.
    // =======================================================================
    {
        const sessionSource = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        assert(/getPlacementInfoForPublication\(publicationId\)\s*\{/.test(sessionSource),
            '1. application/world/WorldNavigationSession.js exposes getPlacementInfoForPublication(publicationId) — a publisher-side lookup keyed by the exact Publication identity a distribution claim would need to be bound to.');
        assert(/getPlacementInfo\(documentId\)\s*\{/.test(sessionSource),
            '2. the sibling getPlacementInfo(documentId) also exists, confirming this file already computes a `{ placementId, publicationId, position }`-shaped record as an ordinary, everyday capability — never something this audit invents.');

        const placementSource = await readSource('application/snapshot/placement/SnapshotWorldPlacement.js');
        assert(/placementInfo`\s*IS DUCK-TYPED TO WorldNavigationSession#getPlacementInfo\(\)/i.test(placementSource),
            '3. application/snapshot/placement/SnapshotWorldPlacement.js already documents this exact shape as its own placementInfo contract — the SAME shape a publisher-side claim would carry, confirming no new position-computation mechanism is needed.');
    }
    console.log('✓ Section A: the authoritative, already-shipped position computation this milestone traces is application/world/WorldNavigationSession.js#getPlacementInfoForPublication(publicationId) — no new spatial computation is missing.');

    // =======================================================================
    // Section B — The exact production boundary where the claim is dropped.
    //
    // AMENDED BY 0.9.566 — Distribute Existing Claimed Position Through
    // Snapshot Distribution, in place, mirroring this codebase's own
    // established amendment precedent (e.g. 0.9.558 amending 0.9.557's own
    // Section H for the identical situation) rather than leaving a
    // now-false "the gap exists" assertion behind. This audit's own
    // Section I verdict named exactly two closing points; 0.9.566 closed
    // both, so this section now reconfirms the OPPOSITE fact at each one:
    // the fields this audit found dropped are now genuinely forwarded.
    // =======================================================================
    {
        const commandSource = await readSource('application/snapshot/SnapshotDistributionCommand.js');
        const runFnMatch = commandSource.match(/async function runSnapshotDistribution\([\s\S]*?\n\}/);
        assert(runFnMatch, '1. application/snapshot/SnapshotDistributionCommand.js#runSnapshotDistribution() exists as an isolable function.');
        const runFnBody = runFnMatch[0];
        assert(/discoveryPublisher\.publish\(\{\s*contentHash:\s*contentReference\.hash,\s*locator:\s*contentReference\.uri,\s*storage:\s*contentReference\.storage,\s*publicationId,\s*claimedPosition\s*\}\)/.test(runFnBody),
            '2. (0.9.566) its own discoveryPublisher.publish() call site now supplies publicationId/claimedPosition alongside contentHash/locator/storage, forwarded unmodified from this function\'s own parameters.');
        assert(/publicationId/.test(runFnBody) && /claimedPosition/.test(runFnBody),
            '3. (0.9.566) both `publicationId` and `claimedPosition` now appear in runSnapshotDistribution() — the exact production boundary this audit\'s own brief named is closed.');

        const exportedFnMatch = commandSource.match(/export function executeSnapshotDistributionCommand\(\{[\s\S]*?\n\}\s*=\s*\{\}\)/);
        assert(exportedFnMatch, '4. the exported entry point exists as an isolable signature.');
        assert(/publicationId/.test(exportedFnMatch[0]) && /claimedPosition/.test(exportedFnMatch[0]),
            '5. (0.9.566) executeSnapshotDistributionCommand()\'s own public parameter list now carries publicationId/claimedPosition alongside bytes/contentStore/discoveryPublisher — a caller who already computed both (Section A) now has a parameter through which to hand them in.');

        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        const distributeFnMatch = worldViewSource.match(/function distributeWorldEncounterSnapshot\(publication, storage, remotePinningConfiguration\)\s*\{[\s\S]*?\n        \}/);
        assert(distributeFnMatch, '6. ui/views/WorldView.js#distributeWorldEncounterSnapshot(publication, storage) exists as an isolable function — the ONE production call site that invokes Snapshot distribution.');
        const distributeFnBody = distributeFnMatch[0];
        assert(/getPlacementInfoForPublication\(publication\.id\)/.test(distributeFnBody),
            '7. (0.9.566) it now calls session.getPlacementInfoForPublication(publication.id) — the full `publication` object it is handed is finally read for its own id, exactly as Section A\'s own already-available lookup allows.');
        assert(/placementInfo \? placementInfo\.publicationId : undefined/.test(distributeFnBody)
            && /placementInfo \? placementInfo\.position : undefined/.test(distributeFnBody),
            '8. (0.9.566) it now forwards placementInfo.publicationId/placementInfo.position into snapshotDistributionCommand() — both `undefined` (never a fabricated fallback) when this Publication has no placementInfo at all.');
    }
    console.log('✓ Section B (FLAGSHIP, AMENDED BY 0.9.566): the claim is no longer dropped at either stacked point on the one real production path — application/snapshot/SnapshotDistributionCommand.js now accepts and forwards publicationId/claimedPosition, and its only production caller, ui/views/WorldView.js#distributeWorldEncounterSnapshot(), now reads publication.id through session.getPlacementInfoForPublication() and forwards the result unmodified.');

    // =======================================================================
    // Section C — Announcement contracts already support the claim, live.
    // =======================================================================
    {
        const withClaim = describeSnapshotDiscoveryEnvelope({
            protocol: 'forkbuild-snapshot-discovery',
            version: 1,
            contentHash: 'hash-1',
            locator: 'ar://tx-1',
            storage: 'ar',
            publicationId: 'pub-1',
            claimedPosition: { x: 1, y: 2, z: 3 }
        });
        assert(withClaim && withClaim.publicationId === 'pub-1' && withClaim.claimedPosition.x === 1,
            '1. core/SnapshotDiscoveryEnvelope.js#describeSnapshotDiscoveryEnvelope() already accepts and validates a claim pair — this is not new capability this milestone would need to build.');

        let capturedTemplate = null;
        const nostrPublisher = new NostrSnapshotDiscoveryPublisher({
            discoveryTag: 'forkbuild-snapshot',
            publishImpl: async (relayUrl, eventTemplate) => {
                capturedTemplate = eventTemplate;
                return { published: true, id: '1'.repeat(64) };
            }
        });
        const nostrResult = await nostrPublisher.publish({
            contentHash: 'hash-2', locator: 'ar://tx-2', storage: 'ar',
            publicationId: 'pub-2', claimedPosition: { x: 4, y: 5, z: 6 }
        });
        assert(nostrResult && nostrResult.published === true, '2. NostrSnapshotDiscoveryPublisher#publish() accepts publicationId/claimedPosition without any change and still succeeds.');
        const publishedContent = JSON.parse(capturedTemplate.content);
        assert(publishedContent.publicationId === 'pub-2' && publishedContent.claimedPosition.z === 6,
            '3. ...and the announced Nostr event content genuinely carries the claim, byte for byte.');

        let capturedMaterial = null;
        const arweavePublisher = new ArweaveSnapshotDiscoveryPublisher({
            discoveryTag: 'forkbuild-snapshot',
            uploadTaggedTransaction: async (material) => { capturedMaterial = material; return { id: 'tx-id-123' }; }
        });
        const arweaveResult = await arweavePublisher.publish({
            contentHash: 'hash-3', locator: 'ar://tx-3', storage: 'ar',
            publicationId: 'pub-3', claimedPosition: { x: 7, y: 8, z: 9 }
        });
        assert(arweaveResult && arweaveResult.published === true, '4. ArweaveSnapshotDiscoveryPublisher#publish() accepts the identical two fields without any change and still succeeds.');
        const arweaveMaterial = JSON.parse(capturedMaterial);
        assert(arweaveMaterial.publicationId === 'pub-3' && arweaveMaterial.claimedPosition.y === 8,
            '5. ...and the announced Arweave transaction material genuinely carries the claim too.');
    }
    console.log('✓ Section C: both Snapshot discovery publishers, and the envelope underneath them, already support a publisher-supplied publicationId/claimedPosition pair, proven live rather than assumed from a header comment. No wire-protocol work is needed.');

    // =======================================================================
    // Section D — Nostr path, end to end, live.
    // =======================================================================
    {
        const relayEvents = [];
        const publishImpl = async (relayUrl, eventTemplate) => {
            relayEvents.push({ ...eventTemplate, id: `${'a'.repeat(63)}${relayEvents.length}` });
            return { published: true, id: relayEvents[relayEvents.length - 1].id };
        };
        const queryImpl = async () => relayEvents.map((event) => ({ content: event.content, tags: event.tags }));

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl });
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl });

        // A caller who DOES supply the claim (what a fixed WorldView call
        // site would do) round-trips it correctly end to end today —
        // proving the ONLY missing piece is the production call site
        // itself, never the substrate.
        await publisher.publish({
            contentHash: 'hash-claim', locator: 'ar://tx-claim', storage: 'ar',
            publicationId: 'pub-claim', claimedPosition: { x: 10, y: 20, z: 30 }
        });
        const candidates = await queryService.search('forkbuild-snapshot');
        const withClaim = candidates.find((c) => c.contentHash === 'hash-claim');
        assert(withClaim && withClaim.publicationId === 'pub-claim' && withClaim.claimedPosition.x === 10,
            '1. a claim a caller genuinely supplies survives Nostr announce -> query round-trip unmodified — the substrate is not the gap.');

        // The CURRENT production shape: executeSnapshotDistributionCommand()
        // calling discoveryPublisher.publish() with only three fields,
        // exactly as application/snapshot/SnapshotDistributionCommand.js does today.
        const contentStore = { put: async () => ({ hash: 'hash-noclaim', uri: 'ar://tx-noclaim', storage: 'ar' }) };
        const { announcement } = await executeSnapshotDistributionCommand({
            bytes: 'irrelevant', contentStore, discoveryPublisher: publisher
        });
        assert(announcement && announcement.published === true, '2. today\'s real executeSnapshotDistributionCommand() call succeeds...');
        const noClaimCandidates = await queryService.search('forkbuild-snapshot');
        const withoutClaim = noClaimCandidates.find((c) => c.contentHash === 'hash-noclaim');
        assert(withoutClaim && withoutClaim.publicationId === undefined && withoutClaim.claimedPosition === undefined,
            '3. ...but the resulting discovery candidate carries NEITHER field — confirming, live and through the real production command, that today\'s Nostr announcements never carry a position claim, not because the substrate can\'t, but because nothing upstream ever hands one in.');
    }
    console.log('✓ Section D: the Nostr substrate genuinely round-trips a claim end to end when supplied one; the real, unmodified executeSnapshotDistributionCommand(), called exactly as production calls it today, never supplies one. The gap is entirely upstream of the substrate.');

    // =======================================================================
    // Section E — Arweave path: discovery WRITES are unwired in production,
    // independent of the claim question.
    // =======================================================================
    {
        const mainSource = (await Promise.all(mainFiles().map((file) => readSource(file)))).join('\n');
        assert(/new ArweaveSnapshotDiscoveryQueryService\(/.test(mainSource),
            '1. ui/main.js constructs a real ArweaveSnapshotDiscoveryQueryService — the READ side of Arweave Snapshot discovery is wired.');
        assert(!/new ArweaveSnapshotDiscoveryPublisher\(/.test(mainSource),
            '2. ui/main.js never constructs an ArweaveSnapshotDiscoveryPublisher — the WRITE side (announcing a Snapshot discovery envelope to Arweave, claim or no claim) is entirely unwired in production.');

        const compositionSource = await readSource('application/snapshot/SnapshotDistributionRuntimeComposition.js');
        assert(/import \{ NostrSnapshotDiscoveryPublisher \}/.test(compositionSource),
            '3. composeSnapshotDistributionRuntime() imports only the Nostr discovery publisher...');
        assert(!/ArweaveSnapshotDiscoveryPublisher/.test(compositionSource),
            '4. ...and never imports or constructs the Arweave discovery publisher at all — confirmed structurally, not merely absent from ui/main.js by omission.');
    }
    console.log('✓ Section E: Arweave-substrate Snapshot discovery ANNOUNCEMENT is unwired in production today independent of the claim question — only Nostr ever announces a Snapshot discovery envelope. Arweave is used solely for content placement (ArweaveContentStore) and discovery QUERY (ArweaveSnapshotDiscoveryQueryService), never discovery WRITE.');

    // =======================================================================
    // Section F — Identity binding holds; production wire yields only ABSENT.
    // =======================================================================
    {
        const publicationA = { id: 'publication-A' };
        const publicationB = { id: 'publication-B' };
        const sharedContentHash = 'shared-hash';

        const candidateForA = Object.freeze({
            contentHash: sharedContentHash, locator: 'ar://a', storage: 'ar',
            publicationId: publicationA.id, claimedPosition: { x: 1, y: 0, z: 1 }
        });
        const candidateForB = Object.freeze({
            contentHash: sharedContentHash, locator: 'ar://b', storage: 'ar',
            publicationId: publicationB.id, claimedPosition: { x: 9, y: 0, z: 9 }
        });

        const aClaimsOwn = resolveSnapshotWorldPositionClaim(candidateForA, publicationA.id);
        const bClaimsOwn = resolveSnapshotWorldPositionClaim(candidateForB, publicationB.id);
        assert(aClaimsOwn.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && aClaimsOwn.position.x === 1,
            '1. two Publications sharing one contentHash each correctly resolve CLAIMED for their own candidate...');
        assert(bClaimsOwn.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && bClaimsOwn.position.x === 9,
            '2. ...independently, with no cross-contamination.');

        const aClaimsB = resolveSnapshotWorldPositionClaim(candidateForA, publicationB.id);
        const bClaimsA = resolveSnapshotWorldPositionClaim(candidateForB, publicationA.id);
        assert(aClaimsB.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED && aClaimsB.position === null,
            '3. and cross-assignment in BOTH directions is correctly MISMATCHED, never a fabricated position — the identity rule from 0.9.163/0.9.172 still holds.');
        assert(bClaimsA.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED && bClaimsA.position === null,
            '4. confirmed in the other direction too.');

        // The candidate SHAPE production actually produces today (Section D,
        // finding 3): no publicationId, no claimedPosition at all.
        const todaysRealCandidate = Object.freeze({ contentHash: sharedContentHash, locator: 'ar://real', storage: 'ar' });
        const outcomeToday = resolveSnapshotWorldPositionClaim(todaysRealCandidate, publicationA.id);
        assert(outcomeToday.outcome === SnapshotWorldPositionClaimOutcome.ABSENT && outcomeToday.position === null,
            '5. against the candidate shape production genuinely announces today, resolveSnapshotWorldPositionClaim() can only ever report ABSENT — CLAIMED and MISMATCHED are both currently unreachable outcomes in the live product, not because the logic is wrong, but because the wire never carries the two fields that logic depends on.');
    }
    console.log('✓ Section F: the identity-binding rule (publicationId-bound, never contentHash-bound) is correct and safe. Applied to what production actually announces today, it can only ever yield ABSENT — CLAIMED and MISMATCHED remain live, tested, correct, and completely unreachable in the shipped product.');

    // =======================================================================
    // Section G — Authority boundary intact: no automatic placement anywhere.
    // =======================================================================
    {
        const commandSource = await readSource('application/snapshot/SnapshotDistributionCommand.js');
        assert(!/PlacementRecord|LocalPlacementRegistry|WorldPlacement/.test(commandSource),
            '1. application/snapshot/SnapshotDistributionCommand.js references no PlacementRecord, LocalPlacementRegistry, or WorldPlacement — distributing (or a future claim-carrying distribution) never places anything by itself.');

        const nostrPublisherSource = await readSource('application/nostr/NostrSnapshotDiscoveryPublisher.js');
        const arweavePublisherSource = await readSource('application/arweave/ArweaveSnapshotDiscoveryPublisher.js');
        for (const [name, source] of [['Nostr', nostrPublisherSource], ['Arweave', arweavePublisherSource]]) {
            assert(!/PlacementRecord|LocalPlacementRegistry/.test(source),
                `2. the ${name} discovery publisher references no PlacementRecord/LocalPlacementRegistry either — announcing a claim is never itself a placement.`);
        }

        const claimSource = await readSource('application/snapshot/placement/SnapshotWorldPositionClaim.js');
        assert(/A PURE FUNCTION.*NO I\/O/i.test(claimSource) || /NO I\/O, NO CRYPTOGRAPHIC RE-VERIFICATION/i.test(claimSource),
            '3. resolveSnapshotWorldPositionClaim() documents itself as a pure, no-I/O decision function.');
        assert(!/PlacementRecord|LocalPlacementRegistry/.test(claimSource),
            '4. ...and, structurally, never touches PlacementRecord/LocalPlacementRegistry — consuming a claim still never becomes authoritative World state on its own.');

        const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        assert(/useClaimedSnapshotPosition\(\)\s*\{/.test(panelSource),
            '5. the one place a claim is ever consumed remains a distinct, person-initiated method...');
        assert(/@click="useClaimedSnapshotPosition"/.test(panelSource),
            '6. ...reachable only through its own explicit button click, never invoked automatically by discovery, selection, resolution, or materialization.');
    }
    console.log('✓ Section G: the authority boundary 0.9.172 established remains fully intact — a distributed claim, once this gap is closed, still cannot become authoritative placement without a person\'s own explicit "Use Claimed Position" click. Closing this gap would not weaken that boundary.');

    // =======================================================================
    // Section H — The existing consumer is already production-ready.
    // =======================================================================
    {
        const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        assert(/import \{ resolveSnapshotWorldPositionClaim \} from '\.\.\/\.\.\/application\/snapshot\/placement\/SnapshotWorldPositionClaim\.js'/.test(panelSource),
            '1. ui/components/OwnPublicationPanel.js — a real, shipped production UI component — already imports the consumer function directly.');
        assert(/this\.selectedSnapshotWorldPositionClaimResult = resolveSnapshotWorldPositionClaim\(candidate, publication\.id\)/.test(panelSource),
            '2. ...and already calls it with a real selected discovery candidate and the real target Publication\'s own id — the exact call shape a genuinely-claim-bearing candidate would need.');
        assert(/selectedSnapshotWorldPositionClaimResult/.test(panelSource) && /placeMaterializedSnapshot/.test(panelSource),
            '3. the result already flows into this component\'s own placement action — the full consumption path, end to end, already exists in shipped UI.');
    }
    console.log('✓ Section H: the consumer half of this feature is already fully built and wired into production UI. The only thing standing between today\'s product and a working "decentralized position claim" feature is the two-point publisher-side wiring gap this audit\'s own Section B named exactly.');

    // =======================================================================
    // Section I — Classification and the smallest closing seam.
    //
    // AMENDED BY 0.9.566 — findings 1 and 2 below are now closed (Section B,
    // amended above); the verdict text is left otherwise intact as the
    // historical record of what this audit found, plus this note.
    // =======================================================================
    console.log('✓ Section I — VERDICT (findings 1–2 CLOSED by 0.9.566; see Section B).\n\n' +
        '  CLASSIFICATION (AS OF 0.9.565): PRODUCT_GAP, not ARCHITECTURAL_GAP.\n\n' +
        '  Every primitive this feature needs already exists, is already tested, and (on the consumer side) is already\n' +
        '  shipped in production UI:\n' +
        '    - the position source            (application/world/WorldNavigationSession.js#getPlacementInfoForPublication)\n' +
        '    - the wire contract              (core/SnapshotDiscoveryEnvelope.js, 0.9.171/0.9.498)\n' +
        '    - both discovery publishers      (Nostr 0.9.171, Arweave 0.9.498 — both proven live, Section C)\n' +
        '    - both discovery query services  (Nostr, Arweave — both already forward the claim, unmodified)\n' +
        '    - the identity-safe consumer     (application/snapshot/placement/SnapshotWorldPositionClaim.js, 0.9.172)\n' +
        '    - the production UI consumer     (ui/components/OwnPublicationPanel.js#useClaimedSnapshotPosition, Section H)\n\n' +
        '  What is missing is exactly two wiring points, both named exactly in Section B, plus one independent,\n' +
        '  narrower gap named in Section E:\n\n' +
        '  1. application/snapshot/SnapshotDistributionCommand.js does not accept or forward publicationId/claimedPosition to\n' +
        '     discoveryPublisher.publish() — a small, optional-parameter addition, mirroring exactly how the two\n' +
        '     publishers themselves already added the identical pair as optional arguments in 0.9.171/0.9.498.\n' +
        '  2. ui/views/WorldView.js#distributeWorldEncounterSnapshot() does not read publication.id or call\n' +
        '     WorldNavigationSession#getPlacementInfoForPublication(publication.id) to supply either field.\n' +
        '  3. (Independent of the claim.) ui/main.js never composes an ArweaveSnapshotDiscoveryPublisher at all, so\n' +
        '     today Arweave never announces a Snapshot discovery envelope of any kind, claim or no claim — a\n' +
        '     pre-existing gap this audit surfaces but does not attribute to the claim feature specifically.\n\n' +
        '  This audit makes no production change. It recommends a narrowly-scoped follow-up limited to closing\n' +
        '  finding 1 and 2 above (a genuine "0.9.566 — Distribute Publication Claimed Position" milestone), with\n' +
        '  finding 3 left as its own, separately-scoped, independent decision — extending Snapshot distribution to\n' +
        '  Arweave announcements is a materially different-sized change than forwarding two already-optional fields\n' +
        '  through an existing Nostr call, and bundling them risks widening a small, safe seam into a larger one.\n' +
        '  Consistent with 0.9.171\'s own original restraint, any such follow-up should remain a pure "carry an\n' +
        '  already-computed value one seam further" change — no new position algorithm, no automatic placement, no\n' +
        '  change to application/snapshot/placement/SnapshotWorldPositionClaim.js, core/SnapshotDiscoveryEnvelope.js, or either\n' +
        '  publisher, and no weakening of the explicit, person-initiated consumption gate proven intact in Section G.'
    );
}

run().catch((error) => {
    console.error('DecentralizedPublicationPositionClaimDistributionBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
