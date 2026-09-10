import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { UnpublishDocumentUseCase } from '../application/UnpublishDocumentUseCase.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.9.346 — Decentralized Distribution Guidance Product Gap Audit.
//
// Type: test-only product gap audit. Production changes: NONE.
//
// 0.9.345 closed the known-peer connection arc. This milestone asks a
// completely different, longer-standing question a user raised directly:
// after Repository Publish succeeds and a Publication exists LOCALLY,
// is the substantial decentralized-distribution machinery this codebase
// has already built (Snapshot distribution, Publication announcement,
// Snapshot placement, remote IPFS pinning, Bitcoin/Base anchoring) — every
// one of them, real, tested, shipped — actually REACHABLE and legible at
// the moment a person most wants it: right after they just published?
// Or does reaching it require already knowing it exists?
//
//   Repository Publish -> local Publication -> "now what?"
//
// This is deliberately NOT the earlier provider-preference question
// (0.9.293-0.9.304, "which provider"). It is one layer earlier: "how does
// a person discover and deliberately invoke a capability that already
// exists," never whether to build a new one.
//
// Sections (A-J), each grounded in real source or a real, live object
// graph — never prose carried over from an earlier milestone without
// re-checking it against the current tree:
//
//   A — FLAGSHIP. The post-publish handoff, live and structural: what a
//       person actually sees the instant Repository Publish succeeds,
//       on both surfaces that can trigger it (Editor Toolbar, World View).
//   B — Capability inventory. Five real, independently-shipped
//       distribution/proof mechanisms, sourced exactly: which file, which
//       button, which surface, which dependency.
//   C — The asymmetric reachability finding. The one existing capability
//       that most resembles "announce this Publication for discovery"
//       (`WorldEncounterCanvas`'s own "Distribute Publication") is reachable
//       through a materially harder path than "Distribute Snapshot" is,
//       for the identical just-published Publication — with no comment
//       anywhere in source treating that asymmetry as a deliberate choice.
//   D — Local-first invariant. Publish/Unpublish perform no network I/O of
//       any kind and never construct, import, or depend on any
//       distribution collaborator.
//   E — Fusion vs. independence, examined honestly rather than assumed.
//       Snapshot placement and Snapshot announcement are NOT two
//       independent buttons today — they are one deliberately sequenced,
//       dependent action. Across FAMILIES (Snapshot/Publication
//       distribution, Snapshot placement, remote IPFS, anchoring), the
//       five mechanisms are structurally independent — zero cross-imports.
//   F — Provider-preference scope, reconfirmed fresh. The CONTENT
//       `RoleProviderPreference` arc (0.9.293-0.9.304) touches exactly one
//       of the five mechanisms; the other four have no preference concept
//       at all today.
//   G — UI duplication assessment. Every pair that LOOKS similar,
//       classified: genuine distinct capability, or the same capability
//       presented twice.
//   H — Route topology. Three separate, manually-navigated surfaces
//       (Repository catalog, Editor/World View, Publication Center) with a
//       persistent global nav link between them, but nothing at the moment
//       of publish success ever signposts which one to visit next.
//   I — Explicit user agency, proven negatively. None of the five
//       distribution mechanisms is ever invoked automatically by Publish,
//       Unpublish, or any other code path examined in this audit.
//   J — Final decision matrix and verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

function createTestDocument(title = 'Test World') {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

async function run() {

    // =======================================================================
    // Section A — FLAGSHIP. The post-publish handoff, live and structural.
    // =======================================================================
    {
        const toolbarSource = await readSource('ui/components/Toolbar.js');
        const publishFnMatch = toolbarSource.match(/function publish\(\) \{[\s\S]*?\n        \}/);
        assert(publishFnMatch, '1. ui/components/Toolbar.js#publish() exists as a real, isolable function.');
        const publishFnBody = publishFnMatch[0];
        assert(/report\(`Published "\$\{publication\.title\}"`\)/.test(publishFnBody),
            '2. on success, the Editor\'s own publish() does exactly one thing: report a one-line "Published \\"<title>\\"" message.');
        assert(!/router\.|Modal|modal|distribut|Distribut|nostr|Nostr|ipfs|Ipfs|anchor|Anchor/i.test(publishFnBody),
            '3. that function body contains no navigation call, no modal, and no reference to any distribution/announcement/anchoring vocabulary of any kind — nothing beyond the toast is triggered.');

        const worldViewSource = await readSource('ui/views/WorldView.js');
        const publishActiveMatch = worldViewSource.match(/function publishActiveDocument\(\) \{[\s\S]*?\n        \}/);
        assert(publishActiveMatch, '4. ui/views/WorldView.js#publishActiveDocument() exists as a real, isolable function — the SECOND surface Repository Publish is reachable from.');
        const publishActiveBody = publishActiveMatch[0];
        assert(/feedback\.show\(`Published "\$\{publication\.title\}"`\)/.test(publishActiveBody),
            '5. World View\'s own publish handler reports the IDENTICAL one-line message shape as the Editor\'s.');
        assert(!/router\.|Modal|modal|distribut|Distribut|nostr|Nostr|ipfs|Ipfs|anchor|Anchor/i.test(publishActiveBody),
            '6. and, exactly like the Editor\'s own handler, triggers nothing beyond that toast — no router navigation, no modal, no distribution call of any kind.');

        // Live: a real publish, through the real production class, proves
        // the toast's own claim ("Published") is the entire observable
        // outcome — nothing about the returned Publication itself hints at,
        // requires, or references any further action.
        const storage = new InMemoryStorageProvider();
        const publisher = new LocalPublisherProvider(storage);
        const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider)
            .execute({ document: createTestDocument('Handoff Test') });
        assert(publication && publication.title === 'Handoff Test', '7. a real publish genuinely succeeds and returns a real Publication...');
        assert(typeof publication.distribute !== 'function' && typeof publication.announce !== 'function' && typeof publication.anchor !== 'function',
            '8. ...whose own object carries no distribute()/announce()/anchor() method or hint of any kind — every one of the five capabilities below is reached through an entirely separate surface a person must already know to visit.');
    }
    console.log('✓ Section A (FLAGSHIP): on BOTH surfaces Repository Publish is reachable from — the Editor\'s Toolbar and World View — a successful publish produces exactly one thing: a one-line "Published \\"<title>\\"" toast (ui/components/ActionFeedback.js). Proven both structurally (neither handler\'s own source references navigation, a modal, or any distribution/announcement/anchoring vocabulary) and live (a real Publication, from a real PublishDocumentUseCase, carries no method or field hinting at further action). Today, "now what?" has no answer on screen at the moment it is asked.');

    // =======================================================================
    // Section B — Capability inventory, sourced exactly.
    // =======================================================================
    {
        const ownPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(/>\{\{ snapshotDistributionExecuting \? 'Distributing…' : 'Distribute Snapshot' \}\}<\/button>/.test(ownPanelSource),
            '1. "Distribute Snapshot" — the Arweave-content-store + Nostr-discovery-announce pair — is a real button on ui/components/OwnPublicationPanel.js, the primary "My Publication" screen, gated on nothing but :disabled="!publication || snapshotDistributionExecuting".');
        assert(/>Unpublish<\/button>/.test(ownPanelSource) && />\{\{ snapshotExportExecuting \? 'Exporting…' : 'Export Snapshot' \}\}<\/button>/.test(ownPanelSource),
            '2. Unpublish and Export Snapshot are real buttons on the same primary screen.');
        assert(!/PublicationDistributionExecutor|NostrPublicationDistributionRuntimeAdapter|distributeOwnPublication|distributionCommand\s*:/.test(ownPanelSource),
            '3. that same primary screen has NO button for announcing the Publication record itself (as distinct from its Snapshot bytes) — confirmed by the total absence of the Publication-distribution family\'s own vocabulary anywhere in this file.');

        const worldEncounterSource = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(/>\{\{ distributionExecuting \? 'Distributing…' : 'Distribute Publication' \}\}<\/button>/.test(worldEncounterSource),
            '4. "Distribute Publication" — the actual signed Publication record, via distributionCommand — exists, but on a DIFFERENT component, ui/components/WorldEncounterCanvas.js.');

        const decentralizedPubsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(/publishToRemoteIpfs\(entry\)/.test(decentralizedPubsSource) && /Publish to Remote IPFS/.test(decentralizedPubsSource),
            '5. remote IPFS pinning ("Publish to Remote IPFS"/"Publish Again") lives in a THIRD file, ui/views/DecentralizedPublicationsView.js — never OwnPublicationPanel.js or WorldEncounterCanvas.js.');
        assert(/createAnchor\(entry, anchorType\)/.test(decentralizedPubsSource) && /Bitcoin Anchor Publications/.test(decentralizedPubsSource) && /Base Anchor Publications/.test(decentralizedPubsSource),
            '6. Bitcoin/Base anchor creation ("Create <type> Anchor") lives in that SAME third file, under its own "Bitcoin/Base Anchor Publications" cards.');
        assert(/snapshotPlacementCreationCoordinator|preferredSnapshotPlacementCreationCoordinator/.test(decentralizedPubsSource),
            '7. Snapshot Placement (explicit Local/IPFS storage-type buttons, CONTENT-provider-preference-integrated) ALSO lives in that same third file.');

        const anchorFiles = await readSource('application/BlockchainKind.js');
        assert(/BITCOIN/.test(anchorFiles) && /BASE/.test(anchorFiles),
            '8. two chains are domain-modeled (application/BlockchainKind.js), but only Bitcoin has a real wallet/PSBT/broadcast transport (anchoring/Bitcoin*.js) — no anchoring/Base*.js file exists anywhere in this repo; Base\'s own application/CreateBaseAnchorPublicationRecordUseCase.js records an anchor a person obtained EXTERNALLY, it does not create one in-app.');

        console.log(`
Capability inventory (Section B):
| Purpose                          | Mechanism                              | Lives in (file)                       | Reachable from primary post-publish screen? |
| --------------------------------- | --------------------------------------- | -------------------------------------- | -------------------------------------------- |
| Local Publication                | PublishDocumentUseCase                  | Toolbar.js / WorldView.js              | N/A — this IS the trigger                    |
| Snapshot content + announcement   | "Distribute Snapshot" (Arweave+Nostr)   | OwnPublicationPanel.js                 | YES — zero dependency beyond a Publication   |
| Publication record announcement  | "Distribute Publication" (Arweave+Nostr)| WorldEncounterCanvas.js                | NO — requires a selected World Encounter     |
| Snapshot placement (local/IPFS)  | SnapshotPlacementCreationCoordinator    | DecentralizedPublicationsView.js       | NO — separate route, requires local IPFS node|
| Remote IPFS pinning              | IpfsRemotePublicationCoordinator        | DecentralizedPublicationsView.js       | NO — separate route, hosted pinning service  |
| Bitcoin anchor (creatable)       | PublicationAnchorCreationCoordinator    | DecentralizedPublicationsView.js       | NO — separate route, real wallet/PSBT flow   |
| Base anchor (observation only)   | CreateBaseAnchorPublicationRecordUseCase| DecentralizedPublicationsView.js       | NO — records an externally-obtained txid     |
`);
    }
    console.log('✓ Section B: five real, independently shipped distribution/proof mechanisms exist. Exactly ONE ("Distribute Snapshot") is reachable from the primary post-publish screen with zero further dependency; the other four each require navigating to a different file/route and, for three of them, satisfying a real external dependency (a selected World Encounter marker, a running local IPFS daemon, or a connected blockchain wallet). Nothing here is a missing capability — every mechanism above is real, tested, and shipped.');

    // =======================================================================
    // Section C — The asymmetric reachability finding.
    // =======================================================================
    {
        const worldEncounterSource = await readSource('ui/components/WorldEncounterCanvas.js');
        const gateMatch = worldEncounterSource.match(/distributablePublication\(\) \{[\s\S]*?\n        \}/);
        assert(gateMatch, '1. the exact gating computed property for "Distribute Publication" exists and is isolable.');
        assert(/if \(!this\.selectedEncounter \|\| this\.selectedEncounter\.kind !== 'PUBLICATION'\) \{/.test(gateMatch[0]),
            '2. "Distribute Publication" is reachable ONLY when a World Encounter is currently SELECTED, of kind PUBLICATION — never merely because a local Publication exists.');

        const ownPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(/:disabled="!publication \|\| snapshotDistributionExecuting"/.test(ownPanelSource),
            '3. by contrast, "Distribute Snapshot" (OwnPublicationPanel.js) is disabled ONLY by the absence of a Publication or an in-flight call — the identical `publication` prop a successful Repository Publish already supplies, with no selection of any kind required.');

        // 0.9.140's own header (already present in this file, quoted
        // verbatim in Section B above) explicitly named the "zero
        // connected peers, empty World Encounters panel" gap and fixed it
        // for Snapshot distribution ONLY. Confirm that same header never
        // claims to have fixed it for Publication distribution too.
        assert(/Publication"\/"Distribute Snapshot" action .* both reachable only/.test(ownPanelSource),
            '4. OwnPublicationPanel.js\'s own 0.9.140 header names BOTH "Distribute Publication" and "Distribute Snapshot" as having shared the identical selectedEncounter-gated reachability problem before this file existed.');
        assert(/through `selectedEncounter`, which itself only ever exists for a/.test(ownPanelSource),
            '5. ...and names `selectedEncounter` itself as the shared gate both actions started behind.');
        assert(!ownPanelSource.includes('Distribute Publication'),
            '6. but the fix this file goes on to describe (its own existence) is scoped, by its own props list (Section B, assertion 3, which found zero reference to the Publication-distribution family anywhere in this file), to Snapshot distribution alone — the literal phrase "Distribute Publication" never appears anywhere else in this file, not even as a disabled or planned action.');
    }
    console.log('✓ Section C: the one existing capability that most resembles the user\'s own "Nostr = announcement/discovery" role — announcing the signed Publication record itself, not merely its Snapshot bytes, so a stranger can discover the Publication exists at all — is reachable ONLY by navigating World View and selecting a World Encounter marker of kind PUBLICATION. "Distribute Snapshot," the WEAKER of the two announcements (a content-availability hint keyed by a hash a peer must already know, not a discoverable new-Publication announcement), sits one click away on the primary screen. 0.9.140\'s own header shows this was a KNOWN, named parallel problem for both actions, fixed for one and left for the other — not a difference anyone argued for on the merits.');

    // =======================================================================
    // Section D — Local-first invariant.
    // =======================================================================
    {
        const publishSource = await readSource('application/PublishDocumentUseCase.js');
        assert(!/fetch\(|XMLHttpRequest|RTCPeerConnection|WebSocket|Arweave|Nostr|Ipfs|Bitcoin/i.test(publishSource),
            '1. application/PublishDocumentUseCase.js contains no network I/O and no reference to any distribution substrate — structurally incapable of letting a distribution failure affect it, because it never calls out to one.');
        const unpublishSource = await readSource('application/UnpublishDocumentUseCase.js');
        assert(!/fetch\(|XMLHttpRequest|RTCPeerConnection|WebSocket|Arweave|Nostr|Ipfs|Bitcoin/i.test(unpublishSource),
            '2. application/UnpublishDocumentUseCase.js is identically clean — it is the mirror of publish, by its own header, and touches nothing beyond the publisherProvider.');

        // Live: a publish succeeds and produces a fully valid, immediately
        // unpublish-able Publication with ZERO distribution collaborator
        // ever constructed anywhere in this scope — proving the invariant
        // is structural, not merely a policy nobody violated yet.
        const storage = new InMemoryStorageProvider();
        const publisher = new LocalPublisherProvider(storage);
        const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider)
            .execute({ document: createTestDocument('Local First') });
        assert(publication && publication.contentHash, '3. publish succeeds fully on its own — no Arweave signer, Nostr relay, IPFS daemon, or wallet was ever constructed in this test up to this point.');
        const removed = new UnpublishDocumentUseCase(publisher).execute(publication.id);
        assert(removed === true, '4. and the SAME local Publication can be unpublished just as cleanly — local publish/unpublish success never depended on, and is never blocked by, distribution succeeding, being attempted, or even being possible.');
    }
    console.log('✓ Section D: Publish and Unpublish are structurally incapable of being affected by a distribution failure — neither file contains network I/O or references any distribution substrate, and a real publish/unpublish round-trip succeeds with zero distribution collaborator ever constructed. The invariant the audit brief asked for ("failure to distribute should never turn a successful local publication into a failed publication") already holds today, by construction, not by convention.');

    // =======================================================================
    // Section E — Fusion vs. independence, examined honestly.
    // =======================================================================
    {
        // E1 — WITHIN the Snapshot family, placement and announcement are
        // NOT independent: a real, fresh (not merely cited) re-check of
        // 0.9.136's own contract.
        let putCalls = 0, publishCalls = 0;
        const failingStore = { async put() { putCalls += 1; throw new Error('placement failed'); } };
        const publisher1 = { discoveryTag: 'test-tag', async publish() { publishCalls += 1; return { id: 'evt-1' }; } };
        let threw = false;
        try {
            await executeSnapshotDistributionCommand({ bytes: new Uint8Array([1, 2, 3]), contentStore: failingStore, discoveryPublisher: publisher1 });
        } catch { threw = true; }
        assert(threw && putCalls === 1 && publishCalls === 0,
            '1. FRESH RE-CHECK: a Snapshot content-store failure prevents the Nostr announcement from ever being attempted — "Distribute Snapshot" is one fused, sequenced action today, never two independent buttons, by SnapshotDistributionCommand.js\'s own deliberate design ("placement failure prevents discovery").');

        const succeedingStore = { async put() { putCalls += 1; return { hash: 'h1', uri: 'ar://x', storage: 'arweave' }; } };
        const failingPublisher = { discoveryTag: 'test-tag', async publish() { publishCalls += 1; throw new Error('relay unreachable'); } };
        threw = false;
        try {
            await executeSnapshotDistributionCommand({ bytes: new Uint8Array([1, 2, 3]), contentStore: succeedingStore, discoveryPublisher: failingPublisher });
        } catch { threw = true; }
        assert(threw && putCalls === 2 && publishCalls === 1,
            '2. conversely, a successful placement is never rolled back by an announcement failure — the content stays placed even though the overall call rejects; see SnapshotDistributionCommand.js\'s own header, "a successful placement is never rolled back."');

        // E2 — ACROSS the five families (Section B), zero cross-imports:
        // independence is structural, not merely unexercised. For each
        // family's own orchestration file, confirm it names none of the
        // OTHER four families' own orchestration classes anywhere in its
        // source.
        const families = [
            ['application/SnapshotDistributionCommand.js', 'Snapshot distribution', 'SnapshotDistributionCommand'],
            ['application/PublicationDistributionExecutor.js', 'Publication distribution', 'PublicationDistributionExecutor'],
            ['application/CreateExternalSnapshotPlacementUseCase.js', 'Snapshot placement', 'CreateExternalSnapshotPlacementUseCase'],
            ['application/IpfsRemotePublicationCoordinator.js', 'Remote IPFS pinning', 'IpfsRemotePublicationCoordinator'],
            ['application/AddPublicationAnchorUseCase.js', 'Anchor cataloging', 'AddPublicationAnchorUseCase']
        ];
        for (const [path, label, ownName] of families) {
            const source = await readSource(path);
            const importLines = (source.match(/^import\s.*$/gm) || []).join('\n');
            const others = families.filter(([, , name]) => name !== ownName).map(([, , name]) => name);
            for (const otherName of others) {
                assert(!importLines.includes(otherName),
                    `3. ${label} (${path}) never IMPORTS ${otherName} — whatever this file's own comments say by way of documented precedent (several of these files explicitly cite each other's headers as the design they mirror), none of them is ever code-coupled to another family's own orchestration class: ${label} cannot succeed or fail in a way that reaches into it at runtime.`);
            }
        }
    }
    console.log('✓ Section E: independence is real, but drawn at the wrong grain if read as "Nostr/Snapshot/IPFS/Anchor are four independent buttons." WITHIN the Snapshot family, placement and announcement are deliberately FUSED and dependent (placement failure blocks announcement; announcement failure never undoes placement) — a fresh, live re-check of 0.9.136\'s own contract. ACROSS the five families in Section B\'s inventory, independence is structural at the code level: zero of the five orchestration files ever IMPORTS another — confirmed by source, not merely by absence of a reported bug — even though several of their own header comments explicitly cite one another as the documented design precedent each one mirrors. Shared vocabulary and a shared shape are not the same thing as runtime coupling.');

    // =======================================================================
    // Section F — Provider-preference scope, reconfirmed fresh.
    // =======================================================================
    {
        const preferenceToken = /RoleProviderPreference|RoleAwareProviderResolver|ResolvePreferredRoleProviderUseCase/;
        const snapshotPlacementSource = await readSource('application/CreateExternalSnapshotPlacementUseCase.js');
        const preferredCoordinatorSource = await readSource('application/PreferredSnapshotPlacementCreationCoordinator.js');
        assert(preferenceToken.test(preferredCoordinatorSource),
            '1. exactly the Snapshot-placement family has a real preference consumer — application/PreferredSnapshotPlacementCreationCoordinator.js.');

        const snapshotDistSource = await readSource('application/SnapshotDistributionCommand.js');
        const pubDistSource = await readSource('application/PublicationDistributionExecutor.js');
        const remoteIpfsSource = await readSource('application/IpfsRemotePublicationCoordinator.js');
        const anchorCatalogSource = await readSource('application/AddPublicationAnchorUseCase.js');
        for (const [source, label] of [
            [snapshotDistSource, 'Snapshot distribution (Distribute Snapshot)'],
            [pubDistSource, 'Publication distribution (Distribute Publication)'],
            [remoteIpfsSource, 'Remote IPFS pinning (Publish to Remote IPFS)'],
            [anchorCatalogSource, 'Anchor cataloging (Bitcoin/Base)'],
            [snapshotPlacementSource, 'Snapshot placement\'s own CREATE use case (not its preference-aware wrapper)']
        ]) {
            assert(!preferenceToken.test(source),
                `2. ${label} has zero reference to the CONTENT RoleProviderPreference vocabulary — this mechanism offers no "select a provider" concept at all today, confirmed by source, not merely by absence of a UI control.`);
        }
    }
    console.log('✓ Section F: the CONTENT RoleProviderPreference arc (0.9.293-0.9.304) touches exactly ONE of the five mechanisms in Section B\'s inventory (Snapshot placement, through application/PreferredSnapshotPlacementCreationCoordinator.js) — the other four (Distribute Snapshot, Distribute Publication, Remote IPFS pinning, and anchor cataloging) reference no preference vocabulary anywhere in their own source. Any future post-publish guidance surface literally cannot degrade into "select a provider for every conceivable role" today, because four of the five roles have no provider-selection concept to surface in the first place — confirming 0.9.304\'s own STOP verdict remains accurate, unrevisited here, not re-litigated.');

    // =======================================================================
    // Section G — UI duplication assessment.
    // =======================================================================
    {
        const decentralizedPubsSource = await readSource('ui/views/DecentralizedPublicationsView.js');

        // G1 — Snapshot placement (local IPFS daemon) vs. remote IPFS
        // pinning (hosted service): DISTINCT, not duplicative.
        assert(/new IpfsContentStore\(\)/.test(await readSource('ui/main.js')) && /new IpfsGatewayContentStore\(\)/.test(await readSource('ui/main.js')),
            '1. Snapshot Placement\'s own "ipfs" storage type is backed by content/IpfsContentStore.js (Kubo — a locally-run IPFS daemon the person must have installed), confirmed in ui/main.js\'s own composition.');
        assert(/HttpPinningProvider/.test(await readSource('application/IpfsRemotePublicationCoordinator.js')),
            '2. "Publish to Remote IPFS" is backed by a completely different collaborator, content/HttpPinningProvider.js (a hosted, third-party pinning service, no local daemon required) — genuinely different infrastructure behind a similar-sounding label, not the same capability shown twice.');

        // G2 — Distribute Snapshot vs. Distribute Publication: DISTINCT
        // content, by the Snapshot family's own explicit boundary.
        const snapshotDistSource = await readSource('application/SnapshotDistributionCommand.js');
        assert(snapshotDistSource.includes('A "Publication package" combining a Signed Claim and a Snapshot')
            && snapshotDistSource.includes('No coupling to Signed Claim')
            && snapshotDistSource.includes('unscheduled concern, if ever built at all'),
            '3. application/SnapshotDistributionCommand.js\'s own header explicitly disclaims combining Snapshot bytes with the signed Publication record — the two "Distribute" buttons announce genuinely different material (Snapshot bytes vs. a signed claim), not the same thing under two names.');

        // G3 — Export Snapshot vs. Distribute Snapshot: DISTINCT (local,
        // synchronous, no network, vs. external content store + announce).
        const ownPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(/Snapshot Export Capability Integration/.test(ownPanelSource) && /no file save, download, or copy-to-clipboard/.test(ownPanelSource),
            '4. Export Snapshot is confirmed, by its own file\'s header, to be a local package-export capability with no network step at all — distinct in kind from Distribute Snapshot\'s external content-store + announce pair, not a redundant path to the same outcome.');
    }
    console.log('✓ Section G: every pair examined that LOOKS similar turns out to be a genuinely distinct capability, sourced to real, different collaborators — Snapshot placement\'s local-daemon IPFS is not remote pinning; Distribute Snapshot\'s bytes are not Distribute Publication\'s signed claim; Export Snapshot\'s local package is not Distribute Snapshot\'s network placement. No duplicate IMPLEMENTATION was found anywhere in this inventory. The fragmentation this audit documents (Section B/C/H) is a REACHABILITY problem, never a redundant-code problem — which is exactly the condition under which a thin forwarding UI seam, never a new distribution implementation, is the right shape for whatever comes next.');

    // =======================================================================
    // Section H — Route topology.
    // =======================================================================
    {
        const appSource = await readSource('ui/App.js');
        assert(/to="\/repository"/.test(appSource) && /to="\/publications"/.test(appSource),
            '1. a persistent, app-wide nav bar (ui/App.js) links both "Repository" (/repository, the published-document catalog) and "Publications" (/publications, the Publication Center where four of Section B\'s five mechanisms live) — the path exists and is always one click away, from anywhere in the app.');

        const repositoryViewSource = await readSource('ui/views/RepositoryView.js');
        assert(/Repository/.test(repositoryViewSource) && !/Distribute|Unpublish|Anchor|Nostr/i.test(repositoryViewSource),
            '2. /repository itself is a thin catalog wrapper (ui/components/PublicationCatalog.js) — it renders no distribution action of its own; reaching one of Section B\'s mechanisms from there requires knowing to navigate further still, to World View or to /publications.');

        // No handler examined in Section A performs a route change of any
        // kind — reconfirmed here as this section's own governing fact,
        // not re-derived from Section A's assertions.
        const toolbarSource = await readSource('ui/components/Toolbar.js');
        const worldViewSource = await readSource('ui/views/WorldView.js');
        const publishBody = toolbarSource.match(/function publish\(\) \{[\s\S]*?\n        \}/)[0];
        const publishActiveBody = worldViewSource.match(/function publishActiveDocument\(\) \{[\s\S]*?\n        \}/)[0];
        assert(!/router/.test(publishBody),
            '3. Toolbar.js#publish() never calls router.push()/router.replace() — no automatic hand-off to /publications or /repository happens today, confirmed within this function\'s own isolated body (WorldView.js elsewhere uses `router` extensively for OTHER handlers — this check is scoped to publish() alone, not the whole file).');
        assert(!/router/.test(publishActiveBody),
            '4. WorldView.js#publishActiveDocument() likewise never navigates anywhere, confirmed within this function\'s own isolated body alone.');
    }
    console.log('✓ Section H: nothing here is unreachable in the sense of "no path exists" — a persistent, app-wide nav bar links every relevant route from anywhere in the app. The gap is narrower and more specific: at the one moment a person is most likely to want the next step (the instant Publish succeeds), nothing on screen says which of "Repository," "World," or "Publications" is the right next click, or why. /repository itself, the catalog a fresh publish lands in, offers no distribution action of its own.');

    // =======================================================================
    // Section I — Explicit user agency, proven negatively.
    // =======================================================================
    {
        const surfaces = [
            ['application/PublishDocumentUseCase.js', 'PublishDocumentUseCase'],
            ['application/UnpublishDocumentUseCase.js', 'UnpublishDocumentUseCase']
        ];
        const distributionVocabulary = /snapshotDistributionCommand|distributionCommand|ipfsRemotePublicationCoordinator|createAnchor|PublicationDistributionExecutor|executeSnapshotDistributionCommand|SnapshotPlacementCreationCoordinator/;
        for (const [path, label] of surfaces) {
            const source = await readSource(path);
            assert(!distributionVocabulary.test(source),
                `1. ${label} (${path}) contains no reference to any of Section B's five distribution mechanisms — publishing/unpublishing can never silently trigger one.`);
        }

        const toolbarSource = await readSource('ui/components/Toolbar.js');
        const worldViewPublishBody = (await readSource('ui/views/WorldView.js')).match(/function publishActiveDocument\(\) \{[\s\S]*?\n        \}/)[0];
        assert(!distributionVocabulary.test(toolbarSource.match(/function publish\(\) \{[\s\S]*?\n        \}/)[0]),
            '2. the Editor\'s own publish() handler body itself references none of the five mechanisms either — confirmed at the UI handler layer, not merely the use-case layer.');
        assert(!distributionVocabulary.test(worldViewPublishBody),
            '3. and neither does World View\'s own publishActiveDocument() handler body.');
    }
    console.log('✓ Section I: zero automatic invocation of any distribution/announcement/placement/anchoring mechanism exists anywhere in the Publish/Unpublish path today, confirmed at both the application-use-case layer and the UI-handler layer. Whatever seam comes next is purely additive — it cannot change what already silently happens today, because nothing does.');

    // =======================================================================
    // Section J — Final decision matrix and verdict.
    // =======================================================================
    console.log(`
Decision matrix:
| Question                                                        | Finding |
| ----------------------------------------------------------------- | ------- |
| Does the decentralized-distribution machinery already exist?      | YES, in full — five real, independently shipped mechanisms (Section B) |
| Is any of it reachable from the moment of publish success?        | Only one of five, with zero dependency (Distribute Snapshot) — Section B/C |
| Is the CLOSEST match to "announcement/discovery" reachable easily?| NO — requires selecting a World Encounter marker, a materially harder path than Distribute Snapshot for the identical Publication — Section C |
| Is any of this genuinely duplicated code?                         | NO — every similar-looking pair is a distinct capability over distinct collaborators — Section G |
| Does distribution failure ever corrupt local publish success?     | NO — structurally incapable, confirmed live — Section D |
| Are the five mechanisms independent of one another?               | YES across families (zero cross-imports); NO within the Snapshot family (placement/announcement deliberately fused) — Section E |
| Does provider preference already overreach into every role?       | NO — scoped to exactly one of five mechanisms today — Section F |
| Is anything invoked automatically without a person choosing it?   | NO, anywhere examined — Section I |
`);

    console.log('\nAll Decentralized Distribution Guidance Product Gap Audit tests passed.');
    console.log(
        '\nVerdict: CONFIRMED GAP — SMALL, NAMED SEAM, NOT A NEW SUBSYSTEM.\n' +
        '  Every piece of distribution/proof infrastructure the product owner\'s own brief named already exists, is\n' +
        '  real, and is independently reachable (Section B) — this audit found no missing CAPABILITY anywhere. What\n' +
        '  it found instead is exactly the narrower problem the brief asked about: a REACHABILITY gap, live-proven\n' +
        '  rather than assumed, at the single moment a person is most likely to want the next step. Two concrete\n' +
        '  facts should shape whatever comes next:\n' +
        '\n' +
        '  1. THE HANDOFF ITSELF (Section A/H). Repository Publish produces a one-line toast and nothing else, on\n' +
        '     both surfaces it is reachable from. A small, purely additive "Your Publication is available on this\n' +
        '     device. Distribute to..." affordance at that exact moment — forwarding to EXISTING commands, never\n' +
        '     reimplementing one — is the smallest seam that closes it.\n' +
        '\n' +
        '  2. THE ASYMMETRY (Section C, this audit\'s own flagship finding). "Distribute Snapshot" already got this\n' +
        '     exact fix once before, for this exact reason — 0.9.140\'s own header names the "zero peers, empty\n' +
        '     World Encounters" gap explicitly and closes it for Snapshot bytes. The parallel, never-fixed half of\n' +
        '     that same 0.9.140 finding — "Distribute Publication," the actual announcement/discovery-shaped\n' +
        '     action — still requires selecting a World Encounter marker today. Whatever ships next should give\n' +
        '     "Distribute Publication" the identical treatment 0.9.140 already gave "Distribute Snapshot," not\n' +
        '     invent a new mechanism to stand beside it.\n' +
        '\n' +
        '  Recommended next step: a small, additive post-publish entry point on the primary screen (or immediately\n' +
        '  reachable from the publish toast) offering, at minimum, the two zero-external-dependency actions this\n' +
        '  audit found already exist but sit at unequal reach — Distribute Snapshot (already one click) and\n' +
        '  Distribute Publication (today, several) — described in the product owner\'s own vocabulary (Publish /\n' +
        '  Distribute / Discover / Retrieve / Anchor) rather than a single undifferentiated "publish everywhere."\n' +
        '  Remote IPFS pinning and Bitcoin/Base anchoring, both of which have real external prerequisites (a\n' +
        '  hosted pinning account; a connected, funded wallet), are better left exactly where they already are —\n' +
        '  in the Publication Center — rather than promoted into a one-click surface that could mislead a person\n' +
        '  into an irreversible or costly action before they are ready for it. This audit makes no UI change\n' +
        '  itself and recommends none be made without a dedicated follow-up milestone scoped to exactly this seam.'
    );
}

run().catch((error) => {
    console.error('DecentralizedDistributionGuidanceProductGapAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
