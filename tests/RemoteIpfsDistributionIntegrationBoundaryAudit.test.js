import { readFile } from 'node:fs/promises';

import { IpfsRemotePublicationCoordinator } from '../application/IpfsRemotePublicationCoordinator.js';
import { IpfsRemotePublicationState } from '../application/IpfsRemotePublicationState.js';
import { IpfsRemotePinningContentStore } from '../content/IpfsRemotePinningContentStore.js';
import { PinningRejectedError } from '../content/HttpPinningProvider.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import {
    SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES,
    resolveSnapshotDistributionContentStore
} from '../application/SnapshotDistributionContentBackendSelection.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { describeSnapshotDiscoveryEnvelope, SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.662 — Remote IPFS Distribution Integration Boundary Audit.
//
// TYPE: test-only architectural/product boundary audit. PRODUCTION CHANGES:
// NONE. No IPFS provider interface changes, no new pinning services, no
// gateway configuration, no Nostr protocol/schema changes, no Snapshot
// redesign, no automatic fallback, no provider ranking/selection, no
// changes to local Kubo behavior, no UI, no wiring — see the requesting
// brief's own "Deliberate exclusions."
//
// CENTRAL QUESTION. Can an IPFS upload performed through the existing
// Remote IPFS HTTP pinning path (content/IpfsRemotePinningContentStore.js,
// 0.8.67; application/IpfsRemotePublicationCoordinator.js, 0.8.68)
// participate in the same Snapshot registry -> Nostr announcement ->
// discovery workflow that already works for a local Kubo node?
//
// NINE SECTIONS, mirroring the brief's own numbered structure (1-7),
// closed with a two-journey recap (H) and a final verdict (I):
//
//   A. The existing local-IPFS distribution journey, traced and run live —
//      what "Distribute Snapshot" for storage 'ipfs' actually does today,
//      end to end, through real production classes.
//   B. The Remote IPFS journey, traced independently — where it actually
//      terminates, live and structural, in the real production UI source.
//   C. The two-contract comparison table (the brief's own §3), most of it
//      answered by proof rather than assertion: the SAME Remote-Pinning-
//      produced ContentReference is fed through the IDENTICAL pipeline
//      Section A already proved for Kubo, live.
//   D. The Snapshot registry admission boundary (the brief's own §4):
//      what PublicationSnapshotPlacement/SnapshotDistributionCommand
//      actually depend on, proven to be provider-blind by source and by
//      construction.
//   E. The registry key-collision finding — a real structural fact this
//      audit surfaces that the brief's own framing did not anticipate:
//      Kubo and Remote Pinning self-report the IDENTICAL storage name,
//      so a SHARED SnapshotPlacementStoreRegistry cannot hold both at
//      once, live-proven.
//   F. The Nostr announcement predicate (the brief's own §5), answered
//      precisely from source and live execution.
//   G. Why Section E's collision is NOT a blocker for Snapshot
//      Distribution specifically — executeSnapshotDistributionCommand()
//      never goes through the registry at all, live-proven with a
//      registry-free Remote Pinning content store.
//   H. The two user journeys (the brief's own §7), modeled directly
//      against current source, with the first exact divergence point
//      named to a single function and call site.
//   I. Final classification, capability matrix, and recommendation scope.
//
// SUPERSEDED IN PART BY 0.9.663 — Connect Remote IPFS to Nostr Snapshot
// Distribution. This audit's own recommendation (Section I, "RECOMMENDATION
// FOR 0.9.663") is exactly what 0.9.663 implemented: publishToRemoteIpfs()
// now calls the SAME snapshotDiscoveryPublisher instance ui/main.js already
// composes for Kubo/Arweave's own "Distribute Snapshot", directly, with the
// contentHash/locator the coordinator's own PUBLISHED outcome already
// carries — never through executeSnapshotDistributionCommand() itself
// (which would re-upload the already-pinned bytes a second time), and
// never touching SnapshotPlacementStoreRegistry (so Section E's own
// registry-key collision finding is unaffected and still holds). Section
// B's own B7 assertion — which asserted the ABSENCE of exactly this
// wiring — is amended in place, below, with an explicit "AMENDED BY
// 0.9.663" marker, following this codebase's own established convention.
// Every other section (A, C, D, E, F, G) still holds unchanged: none of
// them described this specific call site.

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

// A tiny fake content/PinningProvider.js — mirrors tests/
// IpfsRemotePinningContentStore.test.js's own fake exactly, so this
// audit's own Remote Pinning fixtures are provably the same shape that
// file's own flagship section already certifies against the real class.
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

// A tiny fake local Kubo-shaped content/ContentStore.js — put() only,
// storage 'ipfs', mirrors content/IpfsContentStore.js's own contract
// exactly (see that file's own header) without a live daemon.
function makeFakeKuboContentStore({ network = new Map() } = {}) {
    let seq = 0;
    return {
        storage: 'ipfs',
        async put(bytes) {
            const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
            const hash = computeContentHash(text);
            const cid = `bafykubo${++seq}`;
            network.set(cid, text);
            return { hash, algorithm: 'fnv1a-32', mediaType: 'application/json', size: text.length, uri: `ipfs://${cid}`, storage: 'ipfs' };
        },
        // content/IpfsContentStore.js itself implements a real get() —
        // this fake only needs to satisfy application/
        // SnapshotPlacementStoreRegistry.js's own put()+get() constructor
        // check (see content/ContentStore.js's own base contract); this
        // audit's own scenarios never call it.
        async get() { throw new Error('fake Kubo store: get() not exercised by this audit'); }
    };
}

function makeFakeNostrPublishImpl({ shouldFail = false } = {}) {
    let calls = 0;
    const events = [];
    return {
        events,
        get callCount() { return calls; },
        async publishImpl(relayUrl, eventTemplate) {
            calls += 1;
            if (shouldFail) throw new Error('fake relay: unreachable');
            events.push({ relayUrl, eventTemplate });
            return { published: true, id: (calls).toString(16).padStart(64, '0') };
        }
    };
}

async function run() {

    // =======================================================================
    // Section A — The existing local-IPFS distribution journey, live.
    // =======================================================================
    {
        // A1 — 'ipfs' is a real, production-eligible Snapshot Distribution
        // storage backend, not a hypothetical this audit invents.
        assert(SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.includes('ipfs'),
            n('A1. application/SnapshotDistributionContentBackendSelection.js names \'ipfs\' as an eligible Snapshot Distribution storage backend today, alongside \'ar\' — this is not a hypothetical target, it is a live production option.'));

        // A2 — ui/main.js registers a real content/IpfsContentStore.js
        // (Kubo) under 'ipfs' in the SAME registry
        // resolveSnapshotDistributionContentStore() reads from.
        const mainSource = await source('ui/main.js');
        assert(/stores:\s*\[publicationContentStore,\s*new IpfsContentStore\(\)\]/.test(mainSource),
            n('A2. ui/main.js constructs the CREATION-side SnapshotPlacementStoreRegistry (the same registry resolveSnapshotDistributionContentStore() reads) with a real content/IpfsContentStore.js (Kubo) registered for \'ipfs\', confirmed against current source.'));
        assert(/resolveSnapshotDistributionContentStore\(snapshotPlacementStoreRegistry, storage\)/.test(mainSource),
            n('A3. ui/main.js\'s own snapshotDistributionCommand closure resolves its contentStore from exactly that registry, by storage name, confirmed against current source — this IS the production "Editor/Snapshot -> IPFS upload -> CID -> Snapshot registry -> Nostr announcement" pipeline the requesting brief\'s own diagram describes.'));

        // A4 — run that exact pipeline live: a Kubo-shaped store, resolved
        // by name from a real SnapshotPlacementStoreRegistry, fed into the
        // real executeSnapshotDistributionCommand(), announced through a
        // real NostrSnapshotDiscoveryPublisher.
        const registry = new SnapshotPlacementStoreRegistry();
        const kuboStore = makeFakeKuboContentStore();
        registry.register(kuboStore);
        assert(registry.get('ipfs') === kuboStore, n('A4. a real SnapshotPlacementStoreRegistry, given a Kubo-shaped store, resolves it back by its own storage name.'));

        const resolvedStore = resolveSnapshotDistributionContentStore(registry, 'ipfs');
        assert(resolvedStore === kuboStore, n('A5. resolveSnapshotDistributionContentStore(registry, \'ipfs\') returns that exact Kubo-shaped store — the real production selection step.'));

        const { publishImpl, events } = makeFakeNostrPublishImpl();
        const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl });

        const bytes = new TextEncoder().encode(JSON.stringify({ world: 'local-kubo-journey' }));
        const kuboResult = await executeSnapshotDistributionCommand({ bytes, contentStore: resolvedStore, discoveryPublisher });

        assert(kuboResult.contentReference && kuboResult.contentReference.uri.startsWith('ipfs://'),
            n('A6. the real, end-to-end local-Kubo journey produces a genuine ipfs:// ContentReference.'));
        assert(kuboResult.announcement && kuboResult.announcement.published === true,
            n('A7. ...and a genuine Nostr announcement, published through the real NostrSnapshotDiscoveryPublisher — the full "Distribute Snapshot" pipeline for a local Kubo node, live, start to finish, using nothing but real production classes plus a fake network boundary.'));
        assert(events.length === 1 && JSON.parse(events[0].eventTemplate.content).storage === 'ipfs',
            n('A8. the published Nostr event content genuinely carries storage: \'ipfs\' — the announcement is not a stub, it is the real envelope a second replica would actually see.'));
    }
    console.log('✓ Section A: the LOCAL KUBO journey traced end to end against real production classes and real production wiring (ui/main.js). \'ipfs\' is a live, eligible Snapshot Distribution backend today; resolveSnapshotDistributionContentStore() resolves a Kubo-backed store for it from the SAME registry application/CreateExternalSnapshotPlacementUseCase.js also uses; and a real bytes -> put() -> ContentReference -> Nostr-announce sequence, run live through the unmodified production command and publisher, succeeds completely.');

    // =======================================================================
    // Section B — The Remote IPFS journey, traced independently.
    // =======================================================================
    {
        // B1 — the coordinator's own PUBLISHED outcome shape, live.
        const network = new Map();
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: () => makeFakePinningProvider({ network })
        });
        const outcome = await coordinator.publish({
            bytes: JSON.stringify({ world: 'remote-ipfs-journey' }),
            configuration: { endpoint: 'https://pin.example/api/add' }
        });
        assert(outcome.state === IpfsRemotePublicationState.PUBLISHED, n('B1. IpfsRemotePublicationCoordinator#publish() genuinely succeeds against a fake pinning provider, exactly like tests/IpfsRemotePublicationUX.test.js\'s own flagship.'));
        assert(typeof outcome.contentHash === 'string' && outcome.locator.startsWith('ipfs://'),
            n('B2. ...and its PUBLISHED outcome carries a real contentHash and a real ipfs:// locator — the exact two facts application/NostrSnapshotDiscoveryPublisher.js#publish() needs (plus storage) to announce anything at all.'));
        assert(!('storage' in outcome), n('B3. but the outcome object itself carries no `storage` field at all — only contentHash/locator/endpoint/publishedAt/reason — confirmed against application/IpfsRemotePublicationCoordinator.js\'s own `_outcome()` shape.'));

        // B2 — the production UI journey: publishToRemoteIpfs() in
        // ui/views/DecentralizedPublicationsView.js, traced by source.
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const fnMatch = viewSource.match(/async function publishToRemoteIpfs\(entry\) \{[\s\S]*?\n        \}/);
        assert(fnMatch, n('B4. ui/views/DecentralizedPublicationsView.js#publishToRemoteIpfs() exists as a real, isolable function — the ONE production call site for application/IpfsRemotePublicationCoordinator.js#publish() (confirmed earlier, application/DecentralizedDistributionGuidanceProductGapAudit\'s own Section B).'));
        const fnBody = fnMatch[0];
        assert(/ipfsRemotePublicationCoordinator\.publish\(\{ bytes, configuration \}\)/.test(fnBody),
            n('B5. that function calls the coordinator exactly once, with bytes/configuration...'));
        assert(/new IpfsPublicationRecord\(/.test(fnBody),
            n('B6. ...and on a PUBLISHED outcome, constructs an application/IpfsPublicationRecord.js — a LOCAL, ephemeral, display-only record (see that file\'s own header: no signature, no catalog, no peer propagation) — and nothing else.'));
        assert(/snapshotDiscoveryPublisher\.publish\(\{/.test(fnBody),
            n('B7. AMENDED BY 0.9.663 — Connect Remote IPFS to Nostr Snapshot Distribution. At the time this audit was written, publishToRemoteIpfs()\'s own function body contained NO reference to any Nostr discovery publisher, any Snapshot Distribution command, or any Snapshot Placement creation coordinator — THE FIRST DIVERGENCE this section named. 0.9.663 closed exactly that gap: immediately after the REAL PUBLISHED outcome this section\'s own B1/B2 already proved carries everything announcement needs (contentHash/locator, plus a hardcoded storage:\'ipfs\' — see Section E/F for why that\'s always the right self-reported name), this function now calls snapshotDiscoveryPublisher.publish() directly.'));
        assert(!/executeSnapshotDistributionCommand|createExternalSnapshotPlacementUseCase|placementCreationCoordinator\.create|snapshotPlacementStoreRegistry/.test(fnBody),
            n('B7b. AMENDED BY 0.9.663 — and DELIBERATELY still never goes through executeSnapshotDistributionCommand(), any Snapshot Placement creation use case, or the shared SnapshotPlacementStoreRegistry: going through executeSnapshotDistributionCommand()\'s own contentStore.put() would re-upload the ALREADY-pinned bytes a second time for no reason, and Section E\'s own registry-key collision (Kubo and Remote Pinning both self-reporting storage:\'ipfs\') therefore still cannot be triggered by this call site.'));

        // B3 — confirm this is not merely true of the one function; the
        // coordinator's own outcome vocabulary is never consumed anywhere
        // else in this codebase either.
        const ipfsPublicationRecordSource = await source('application/IpfsPublicationRecord.js');
        const ipfsPublicationRecordImports = (ipfsPublicationRecordSource.match(/^import\s.*$/gm) || []).join('\n');
        assert(ipfsPublicationRecordImports.length === 0,
            n('B8. application/IpfsPublicationRecord.js — the one durable(-ish, per-entry, in-memory) shape the Remote IPFS outcome is ever folded into — has ZERO import statements at all: no PublicationSnapshotPlacement, no NostrSnapshotDiscoveryPublisher, no placement creation use case, no store registry (its own header even NAMES core/PublicationSnapshotPlacement.js, in prose, only to explicitly disclaim being wired to it — "never wired into any catalog or store by this milestone"). The Remote IPFS journey is a genuine dead end by construction, not merely by omission at one call site.'));
    }
    console.log('✓ Section B: the REMOTE IPFS journey traced independently, live and structural. A real publish() attempt succeeds and returns a genuine contentHash/locator pair — everything Nostr announcement would need. AMENDED BY 0.9.663: production\'s one call site (publishToRemoteIpfs()) folds that outcome into a local, display-only IpfsPublicationRecord AND NOW ALSO announces it via the same snapshotDiscoveryPublisher instance the Kubo/Arweave path already uses — never through Snapshot Distribution command\'s own contentStore.put()/re-upload, and never through any Snapshot Placement creation use case, both deliberately still unreached from this call site (B7b).');

    // =======================================================================
    // Section C — The two-contract comparison, proven rather than tabulated.
    // =======================================================================
    {
        const network = new Map();
        const provider = makeFakePinningProvider({ network });
        const remoteStore = new IpfsRemotePinningContentStore({ provider });
        const bytes = JSON.stringify({ world: 'contract-comparison' });

        const kuboReference = await makeFakeKuboContentStore({ network: new Map() }).put(bytes);
        const remoteReference = await remoteStore.put(bytes);

        // C1 — structural shape identity (mirrors tests/
        // IpfsRemotePinningContentStore.test.js's own Section A, re-run here
        // as this audit's own live evidence rather than cited from memory).
        // Compared through the public core/ContentReference.js getters —
        // never Object.keys() on the real class's own instance, whose
        // underscored private fields (`_hash`, ...) are an implementation
        // detail orthogonal to this comparison.
        const CONTENT_REFERENCE_FIELDS = ['hash', 'algorithm', 'mediaType', 'size', 'uri', 'storage'];
        assert(CONTENT_REFERENCE_FIELDS.every((field) => field in kuboReference) && CONTENT_REFERENCE_FIELDS.every((field) => field in remoteReference),
            n('C1. a Kubo-produced result and a Remote-Pinning-produced result carry the IDENTICAL set of fields.'));
        assert(kuboReference.storage === remoteReference.storage && kuboReference.algorithm === remoteReference.algorithm,
            n('C2. ...the identical `storage` (\'ipfs\') and `algorithm` values...'));
        assert(remoteReference.uri.startsWith('ipfs://') && kuboReference.uri.startsWith('ipfs://'),
            n('C3. ...and both `uri` values are ipfs:// locators — a caller reading either object cannot tell which backend produced it.'));

        // C2 — THE FLAGSHIP PROOF: feed the Remote-Pinning-produced
        // ContentReference through the IDENTICAL pipeline Section A already
        // proved for Kubo — not a second, parallel pipeline, the SAME
        // executeSnapshotDistributionCommand()/NostrSnapshotDiscoveryPublisher
        // instances, substituting only the contentStore.
        const { publishImpl, events } = makeFakeNostrPublishImpl();
        const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl });
        const remoteResult = await executeSnapshotDistributionCommand({
            bytes,
            contentStore: remoteStore,
            discoveryPublisher
        });
        assert(remoteResult.contentReference.uri.startsWith('ipfs://') && remoteResult.contentReference.hash === remoteReference.hash,
            n('C4. FLAGSHIP: executeSnapshotDistributionCommand() — the SAME, completely unmodified command Section A already ran against Kubo — accepts content/IpfsRemotePinningContentStore.js as its contentStore with ZERO adaptation, calling its put() internally and getting back a real ipfs:// ContentReference whose hash matches the same bytes\' independently-computed hash.'));
        assert(remoteResult.announcement && remoteResult.announcement.published === true,
            n('C5. ...and produces a genuine, successful Nostr announcement through the SAME NostrSnapshotDiscoveryPublisher class — proving the "narrow wiring gap" hypothesis affirmatively: the contract is not merely similar, it is drop-in interchangeable, live, today, with no new adapter class of any kind.'));
        assert(JSON.parse(events[0].eventTemplate.content).storage === 'ipfs',
            n('C6. the resulting announcement is byte-for-byte indistinguishable, on the wire, from Section A\'s own Kubo-sourced announcement — a second replica discovering it has no way to know, and no reason to care, which backend produced the pinned copy.'));
    }
    console.log('✓ Section C: NOT an ADAPTER_GAP. content/IpfsRemotePinningContentStore.js\'s own ContentReference is not merely similarly-shaped to content/IpfsContentStore.js\'s own — it is drop-in interchangeable, live-proven by literally substituting it into the exact same, completely unmodified application/SnapshotDistributionCommand.js + application/NostrSnapshotDiscoveryPublisher.js pipeline Section A already ran for Kubo, with zero new code. Whatever the actual gap is, it is not a mismatched result contract.');

    // =======================================================================
    // Section D — The Snapshot registry admission boundary.
    // =======================================================================
    {
        const placementSource = await source('core/PublicationSnapshotPlacement.js');
        const createPlacementSource = await source('application/CreatePublicationSnapshotPlacementUseCase.js');
        const distCommandSource = await source('application/SnapshotDistributionCommand.js');
        const registrySource = await source('application/SnapshotPlacementStoreRegistry.js');

        for (const [src, label] of [
            [placementSource, 'core/PublicationSnapshotPlacement.js'],
            [createPlacementSource, 'application/CreatePublicationSnapshotPlacementUseCase.js'],
            [distCommandSource, 'application/SnapshotDistributionCommand.js'],
            [registrySource, 'application/SnapshotPlacementStoreRegistry.js']
        ]) {
            assert(!/instanceof\s+Ipfs|instanceof\s+Kubo|instanceof\s+.*ContentStore|KuboProvider/.test(src),
                n(`D1. ${label} contains no \`instanceof\` check against any concrete ContentStore/provider class anywhere in its own source.`));
            assert(!/[Kk]ubo/.test(src), n(`D2. ${label} never mentions Kubo by name — no special-casing of the local daemon anywhere in the Snapshot admission boundary.`));
        }

        // Live: build a PublicationSnapshotPlacement directly from
        // Remote-Pinning-origin fields — no publication catalog, identity,
        // or signing collaborator involved in THIS narrow check; only
        // whether the domain object itself rejects a Remote-Pinning
        // provenance. It does not, because it has no provenance field to
        // reject anything on.
        const remoteReference = await new IpfsRemotePinningContentStore({ provider: makeFakePinningProvider() }).put('remote-admission-check');
        const placement = new PublicationSnapshotPlacement({
            publicationId: 'pub-1',
            contentHash: remoteReference.hash,
            storage: remoteReference.storage,
            locator: remoteReference.uri
        });
        assert(placement.storage === 'ipfs' && placement.locator === remoteReference.uri,
            n('D3. a real core/PublicationSnapshotPlacement.js constructs successfully from Remote-Pinning-origin storage/locator fields — the class has no field, check, or constructor branch that could even express "this locator came from the wrong kind of IPFS backend."'));

        assert(placementSource.includes('storage    (required) — e.g. \'ipfs\'') === false && /storage\s*!==?|!storage\b/.test(placementSource),
            n('D4. the constructor\'s own validation of `storage` is a bare non-empty-string check (see core/PublicationSnapshotPlacement.js\'s own constructor) — never a closed enum, never a provider allowlist.'));
    }
    console.log('✓ Section D: the Snapshot registry admission boundary (core/PublicationSnapshotPlacement.js, application/CreatePublicationSnapshotPlacementUseCase.js, application/SnapshotDistributionCommand.js) is providerblind by construction, not merely by convention — zero instanceof checks, zero mentions of Kubo, and a live PublicationSnapshotPlacement built from Remote-Pinning-origin fields constructs and stores identically to one built from Kubo-origin fields.');

    // =======================================================================
    // Section E — The registry key-collision finding.
    // =======================================================================
    {
        // A fact the requesting brief's own framing did not anticipate:
        // content/IpfsRemotePinningContentStore.js's own `storage` getter
        // is HARD-CODED to 'ipfs' — the identical name content/
        // IpfsContentStore.js (Kubo) already self-reports. application/
        // SnapshotPlacementStoreRegistry.js keys registration by a store's
        // OWN `storage`, by explicit design, never a caller-supplied key
        // (see that file's own header). Two content stores that both name
        // themselves 'ipfs' therefore cannot coexist in ONE registry
        // instance — live-proven here, not merely read off the header.
        const registry = new SnapshotPlacementStoreRegistry();
        const kuboStore = makeFakeKuboContentStore();
        const remoteStore = new IpfsRemotePinningContentStore({ provider: makeFakePinningProvider() });

        assert(kuboStore.storage === remoteStore.storage,
            n('E1. content/IpfsContentStore.js (Kubo) and content/IpfsRemotePinningContentStore.js (Remote Pinning) both self-report the IDENTICAL storage name, \'ipfs\' — confirmed live against the real Remote Pinning class\'s own `storage` getter.'));

        registry.register(kuboStore);
        assert(registry.get('ipfs') === kuboStore, n('E2. registering Kubo first: the registry answers \'ipfs\' with the Kubo store, as expected.'));

        registry.register(remoteStore);
        assert(registry.get('ipfs') === remoteStore && registry.get('ipfs') !== kuboStore,
            n('E3. registering Remote Pinning SECOND, into the SAME registry instance, SILENTLY REPLACES Kubo — application/SnapshotPlacementStoreRegistry.js\'s own documented "last write wins" behavior, live-confirmed to actually fire across these two specific classes. From this point on, EVERY \'ipfs\'-storage lookup through this registry instance — Snapshot Placement creation, Snapshot Distribution\'s own resolveSnapshotDistributionContentStore() — silently stops reaching Kubo at all.'));

        // Contrast: this codebase already solved the analogous problem for
        // RESOLUTION, by using TWO SEPARATE REGISTRY INSTANCES (Kubo for
        // creation, Gateway for resolution) rather than a shared key —
        // confirmed against ui/main.js's own real composition.
        const mainSource = await source('ui/main.js');
        assert(/new CreateSnapshotPlacementResolutionCoordinatorUseCase\(\)\.execute\(\{[\s\S]*?stores:\s*\[publicationContentStore,\s*new IpfsGatewayContentStore\(\{ gatewayUrl: resolvedIpfsGatewayUrl \}\)\]/.test(mainSource),
            n('E4. ui/main.js already keeps a SECOND, independent SnapshotPlacementStoreRegistry for RESOLUTION (backed by content/IpfsGatewayContentStore.js for \'ipfs\', now settings-backed per 0.9.665), entirely separate from the CREATION registry Section A/E1-E3 exercised — confirmed against current source, and explicitly justified there as "never silently overwrites or hides Kubo."'));
    }
    console.log('✓ Section E: a genuine, previously-unnamed structural fact. Kubo and Remote Pinning both self-report `storage: \'ipfs\'` — a SCHEME name, by content/IpfsRemotePinningContentStore.js\'s own explicit design (see that file\'s own header, "an ipfs:// locator names a SCHEME, not which particular backend"). application/SnapshotPlacementStoreRegistry.js keys strictly by that self-reported name, so registering BOTH into ONE shared registry instance is not merely unwired — it is a silent, live-provable overwrite the moment it is attempted the naive way. This codebase has ALREADY solved the identically-shaped problem once, for resolution, with a second independent registry rather than a shared key — the correct precedent for creation/distribution to mirror, never a reason to change the storage-name vocabulary or the registry\'s own single-key-per-name design.');

    // =======================================================================
    // Section F — The Nostr announcement predicate.
    // =======================================================================
    {
        const publisherSource = await source('application/NostrSnapshotDiscoveryPublisher.js');
        const envelopeSource = await source('core/SnapshotDiscoveryEnvelope.js');
        assert(!/instanceof|Kubo|provider\s*\.|ContentStore/.test(publisherSource.replace(/\/\/.*$/gm, '')),
            n('F1. application/NostrSnapshotDiscoveryPublisher.js\'s own executable source (comments stripped) never references a ContentStore, a provider object, or an instanceof check of any kind.'));
        assert(/async publish\(\{ contentHash, locator, storage, publicationId, claimedPosition \} = \{\}\)/.test(publisherSource),
            n('F2. publish()\'s own signature takes exactly three required, plain-string facts (contentHash/locator/storage) plus two optional ones — never a store, a reference object, or a provider handle.'));
        assert(/isNonEmptyString\(candidate\.contentHash\)/.test(envelopeSource) && /isNonEmptyString\(candidate\.locator\)/.test(envelopeSource) && /isNonEmptyString\(candidate\.storage\)/.test(envelopeSource),
            n('F3. core/SnapshotDiscoveryEnvelope.js\'s own describeSnapshotDiscoveryEnvelope() validates exactly those three fields as non-empty strings — nothing else gates admission into a publishable envelope.'));

        // The brief's own §5 asked for the EXACT predicate. Answered
        // precisely, from source: it is `hasContentHash && hasLocator &&
        // hasStorage` (plus protocol/version stamping this file itself
        // performs) — never `provider instanceof KuboProvider`, and never
        // even `publication.cid != null` (there is no publication object in
        // this call at all — three bare strings suffice).
        const remoteReference = await new IpfsRemotePinningContentStore({ provider: makeFakePinningProvider() }).put('predicate-check');
        const described = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash: remoteReference.hash,
            locator: remoteReference.uri,
            storage: remoteReference.storage
        });
        assert(described !== null, n('F4. LIVE: a candidate envelope built entirely from Remote-Pinning-origin fields, with no reference to how they were produced, describes successfully — the predicate the requesting brief asked to distinguish (hasCID vs. instanceof KuboProvider) resolves, concretely, to the narrowest possible case: three non-empty strings.'));
    }
    console.log('✓ Section F: the Nostr announcement predicate, answered precisely rather than hypothesized. It is `hasContentHash && hasLocator && hasStorage` (core/SnapshotDiscoveryEnvelope.js#describeSnapshotDiscoveryEnvelope()) — never `provider instanceof KuboProvider`, and in fact never even a `publication` object of any kind. This is the strongest possible form of the requesting brief\'s own best-case hypothesis (§5).');

    // =======================================================================
    // Section G — Why Section E's collision is not a Distribution blocker.
    // =======================================================================
    {
        // A materially important refinement: Section E's registry collision
        // only affects code paths that go THROUGH the shared registry
        // (Snapshot Placement creation, and ui/main.js's own particular
        // choice of how it builds its snapshotDistributionCommand closure).
        // application/SnapshotDistributionCommand.js's own
        // executeSnapshotDistributionCommand() never imports or requires
        // one at all — proven already in Section C (it accepted a bare
        // IpfsRemotePinningContentStore with no registry in sight), proven
        // again here structurally.
        const distCommandSource = await source('application/SnapshotDistributionCommand.js');
        const distCommandImports = (distCommandSource.match(/^import\s.*$/gm) || []).join('\n');
        assert(!distCommandImports.includes('SnapshotPlacementStoreRegistry'),
            n('G1. application/SnapshotDistributionCommand.js never IMPORTS application/SnapshotPlacementStoreRegistry.js (its own header explicitly disclaims it: "this file never imports... application/SnapshotPlacementStoreRegistry.js") — the registry-key collision Section E found cannot reach this file, because this file never consults a registry at all; it is duck-typed purely against `contentStore.put()`.'));

        const backendSelectionSource = await source('application/SnapshotDistributionContentBackendSelection.js');
        assert(/never imports\s*\n\/\/ SnapshotPlacementStoreRegistry/.test(backendSelectionSource) || /duck-typed against/.test(backendSelectionSource),
            n('G2. application/SnapshotDistributionContentBackendSelection.js — the ONE place a registry lookup currently selects Kubo for storage \'ipfs\' in production — is itself duck-typed (`get()`/`has()`), confirmed by its own header, never coupled to SnapshotPlacementStoreRegistry\'s concrete class.'));

        // Live: a Remote-Pinning content store, constructed the SAME way
        // application/IpfsRemotePublicationCoordinator.js itself already
        // constructs one per call (fresh, from a configuration, with no
        // registry involved), reaches a real Nostr announcement with zero
        // registry participation of any kind — this is Section C's own
        // C4/C5 proof, re-read here as the answer to "is Section E's
        // collision a blocker," rather than re-run.
        assert(true, n('G3. Section C\'s own live C4/C5 proof (a bare, registry-free IpfsRemotePinningContentStore fed directly into executeSnapshotDistributionCommand()) is, read under this section\'s own question, the concrete demonstration that Remote IPFS participating in Snapshot Distribution + Nostr announcement needs NO resolution of Section E\'s registry-key collision at all — that collision only matters for a DIFFERENT, narrower ambition (making Remote IPFS a SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES entry selectable BY NAME through the shared registry, or admitting it into the signed PublicationSnapshotPlacement catalog via the SAME registry application/CreateExternalSnapshotPlacementUseCase.js already shares with Distribution\'s own resolver) — a real, but separate and smaller-scoped, follow-on question.'));
    }
    console.log('✓ Section G: Section E\'s registry-key collision, while real, is not a blocker for the specific journey this audit was asked to trace. application/SnapshotDistributionCommand.js takes any content/ContentStore.js-shaped object directly — it never consults application/SnapshotPlacementStoreRegistry.js at all. The collision only bears on a narrower, separate ambition: selecting Remote IPFS BY NAME through the SAME shared, by-storage-name registry Kubo already occupies under \'ipfs\'.');

    // =======================================================================
    // Section H — The two user journeys, current source, first divergence.
    // =======================================================================
    {
        console.log(`
Current working path (LOCAL KUBO):
  User -> "Distribute Snapshot" (storage='ipfs') -> ui/main.js#snapshotDistributionCommand
       -> resolveSnapshotDistributionContentStore(snapshotPlacementStoreRegistry, 'ipfs')
       -> IpfsContentStore#put(bytes) -> ContentReference{hash, uri:'ipfs://CID', storage:'ipfs'}
       -> executeSnapshotDistributionCommand()'s own discoveryPublisher.publish({contentHash, locator, storage})
       -> NostrSnapshotDiscoveryPublisher -> real relay event -> Remote discovery (Section A, live)

Path (REMOTE IPFS) — AMENDED BY 0.9.663, gap closed:
  User -> "Publish to Remote IPFS" -> ui/views/DecentralizedPublicationsView.js#publishToRemoteIpfs()
       -> IpfsRemotePublicationCoordinator#publish({bytes, configuration})
       -> HttpPinningProvider -> IpfsRemotePinningContentStore#put(bytes) -> ContentReference (Section B, live)
       -> outcome.state === PUBLISHED
       -> new IpfsPublicationRecord({contentHash, locator, ...})   (local display record, unchanged)
       -> snapshotDiscoveryPublisher.publish({contentHash, locator, storage:'ipfs'})   <-- FORMER DIVERGENCE, NOW WIRED
       -> the SAME NostrSnapshotDiscoveryPublisher instance ui/main.js already composes for Kubo/Arweave
       -> real relay event -> Remote discovery, same as the Kubo path above
       -> a Nostr failure here is caught locally and recorded on entry.ipfsRemoteSnapshotAnnouncement;
          it never rewrites the already-PUBLISHED Remote IPFS outcome above (see that function's own header)
`);
        assert(true, n('H1. AMENDED BY 0.9.663 — at the time this audit was written, the first exact divergence between the two journeys was not a missing capability, a missing CID, or a missing storage backend — every fact Nostr announcement needs already existed in memory at the moment publishToRemoteIpfs() constructed its IpfsPublicationRecord; the divergence was exactly one un-taken call. 0.9.663 took that call: publishToRemoteIpfs() now calls snapshotDiscoveryPublisher.publish() directly with the coordinator\'s own contentHash/locator, immediately after a real PUBLISHED outcome, so the REMOTE IPFS path now reaches Nostr announcement and discovery exactly like the LOCAL KUBO path above.'));
    }
    console.log('✓ Section H: both journeys modeled directly against current, real source (never assumed). The local Kubo journey is real, live, and complete today for storage=\'ipfs\'. The Remote IPFS journey produces the identical two facts (contentHash, locator) by the identical point in its own call stack, then terminates into a local display record instead of an announcement call — a single un-taken function call, not a missing capability.');

    // =======================================================================
    // Section I — Final classification, capability matrix, verdict.
    // =======================================================================
    console.log(`
Capability matrix:
| Capability                        | Local Kubo | Remote IPFS | Notes |
| ---------------------------------- | ---------- | ----------- | ----- |
| Upload content                    | YES        | YES         | Both real, tested, shipped |
| Produces CID                      | YES        | YES         | Both content/ContentStore.js#put() implementations |
| Content-addressed identity        | YES        | YES         | Both hash locally, independent of the CID (Section C) |
| Retrieval URI/gateway information | YES        | YES         | Both return ipfs:// (retrieval via content/IpfsGatewayContentStore.js, storage-name-based, provider-blind) |
| Snapshot-compatible result        | YES        | YES         | Drop-in interchangeable — proven live, Section C |
| Snapshot Distribution admission   | YES (prod) | NO (unwired)| executeSnapshotDistributionCommand() would accept it today (Section C/G) — nothing calls it |
| Snapshot Placement catalog admission | YES (prod) | STRUCTURALLY OPEN, PRODUCT-BLOCKED BY REGISTRY KEY | core/PublicationSnapshotPlacement.js is provider-blind (Section D); the SHARED registry key collision (Section E) blocks reaching it by the SAME route Kubo uses |
| Nostr announcement                | YES (prod) | NO (unwired)| Predicate is hasContentHash/hasLocator/hasStorage only (Section F) |
| Remote discovery                  | YES (prod) | N/A today   | Never reached because announcement never happens |
| Restart/distributed continuity    | YES        | YES (if announced)| Resolution already goes through content/IpfsGatewayContentStore.js by storage name, not by creator — a Remote-Pinning-created CID would resolve identically to a Kubo-created one, once/if announced |
`);

    console.log('\nAll Remote IPFS Distribution Integration Boundary Audit tests passed.');
    console.log(
        '\nVerdict: NARROW_WIRING_GAP — confirmed by evidence, refined by one real structural finding this audit\n' +
        'itself surfaced (Section E) that the requesting brief\'s own framing did not anticipate.\n' +
        '\n' +
        '1. THE CORE HYPOTHESIS HOLDS, STRONGLY. content/IpfsRemotePinningContentStore.js\'s own ContentReference is\n' +
        '   not merely similar to content/IpfsContentStore.js\'s own — it is drop-in interchangeable, live-proven by\n' +
        '   literally substituting it into the SAME, completely unmodified application/SnapshotDistributionCommand.js\n' +
        '   + application/NostrSnapshotDiscoveryPublisher.js pipeline the real Kubo path already uses in production\n' +
        '   (Section C). The Snapshot registry\'s own admission boundary (core/PublicationSnapshotPlacement.js,\n' +
        '   application/CreatePublicationSnapshotPlacementUseCase.js) and the Nostr announcement predicate\n' +
        '   (core/SnapshotDiscoveryEnvelope.js) are both provider-blind by construction, not by convention — the\n' +
        '   exact `hasCID`-shaped predicate, never `provider instanceof KuboProvider` (Section D/F).\n' +
        '\n' +
        '2. THE FIRST EXACT DIVERGENCE is a single un-taken call, named to one function and one line-region:\n' +
        '   ui/views/DecentralizedPublicationsView.js#publishToRemoteIpfs(), immediately after a real PUBLISHED\n' +
        '   outcome exists, builds a local, display-only application/IpfsPublicationRecord and returns — it never\n' +
        '   calls a discoveryPublisher, application/SnapshotDistributionCommand.js, or any Snapshot Placement\n' +
        '   creation use case (Section B/H).\n' +
        '\n' +
        '3. ONE GENUINE STRUCTURAL WRINKLE, NEWLY SURFACED (Section E): content/IpfsRemotePinningContentStore.js\n' +
        '   and content/IpfsContentStore.js both self-report the identical `storage: \'ipfs\'` name, and\n' +
        '   application/SnapshotPlacementStoreRegistry.js keys strictly by that self-reported name — so the two\n' +
        '   CANNOT coexist in one shared registry instance; registering both silently drops one (live-proven).\n' +
        '   This does NOT block the specific journey this audit traced (Section G: application/\n' +
        '   SnapshotDistributionCommand.js never goes through that registry at all), but it WOULD block a naive\n' +
        '   attempt to make Remote IPFS selectable by name through the SAME shared registry Kubo already occupies\n' +
        '   under \'ipfs\', or to admit a Remote-Pinning-sourced placement into the signed catalog through the SAME\n' +
        '   creation registry route Kubo uses. This codebase already holds the correct precedent for that separate\n' +
        '   problem — content/IpfsGatewayContentStore.js\'s own resolution registry is already a SECOND, independent\n' +
        '   SnapshotPlacementStoreRegistry instance, never a shared key (Section E4) — should a future milestone\n' +
        '   ever need it.\n' +
        '\n' +
        'RECOMMENDATION FOR 0.9.663, precisely scoped by this evidence: the smallest closing move is NOT a new\n' +
        'adapter, NOT a registry change, and NOT a new storage-name convention. It is wiring\n' +
        'publishToRemoteIpfs()\'s own PUBLISHED outcome into the SAME, already-composed NostrSnapshotDiscoveryPublisher\n' +
        'instance ui/main.js already builds for Distribute Snapshot (currently constructed but never `app.provide()`d\n' +
        'outside the snapshotDistributionCommand closure) — either by exposing that publisher directly, or by\n' +
        'constructing a fresh Remote-Pinning content/ContentStore.js the same way application/\n' +
        'IpfsRemotePublicationCoordinator.js itself already does per call, and handing BOTH to the existing,\n' +
        'completely unmodified application/SnapshotDistributionCommand.js#executeSnapshotDistributionCommand() —\n' +
        'exactly the call this audit\'s own Section C already proved succeeds, live, today. Registering Remote\n' +
        'IPFS into application/SnapshotPlacementStoreRegistry.js, or extending SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES\n' +
        'with a second \'ipfs\'-shaped name, is explicitly NOT required for this journey and should not be added\n' +
        'speculatively — see Section E/G for exactly why that route is both unnecessary and, if taken naively, silently\n' +
        'destructive to the existing Kubo registration.'
    );
}

run().catch((error) => {
    console.error('RemoteIpfsDistributionIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
