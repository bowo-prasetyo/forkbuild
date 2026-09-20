import { readFile } from 'node:fs/promises';

import { IpfsRemotePublicationCoordinator } from '../application/IpfsRemotePublicationCoordinator.js';
import { IpfsRemotePublicationState } from '../application/IpfsRemotePublicationState.js';
import { PinningRejectedError } from '../content/HttpPinningProvider.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.663 — Connect Remote IPFS to Nostr Snapshot Distribution — Closure
// Audit.
//
// Type: closure audit for a narrow production wiring milestone. Production
// changes made BY 0.9.663 itself: `ui/main.js` now exposes the SAME
// `snapshotDiscoveryPublisher` instance it already composes for Kubo/
// Arweave's own "Distribute Snapshot" action, directly, via
// `app.provide('snapshotDiscoveryPublisher', ...)`; `ui/views/
// DecentralizedPublicationsView.js#publishToRemoteIpfs()` now injects it
// and, immediately after a genuine PUBLISHED outcome from
// `IpfsRemotePublicationCoordinator#publish()`, announces that outcome's
// own `contentHash`/`locator` via Nostr — never re-uploading, never
// touching `SnapshotPlacementStoreRegistry`, never a second
// `NostrSnapshotDiscoveryPublisher`. THIS FILE adds no production code of
// its own; every section below is either a live run of real, unmodified
// production classes (`IpfsRemotePublicationCoordinator`,
// `NostrSnapshotDiscoveryPublisher`, `NostrSnapshotDiscoveryQueryService`,
// `application/SnapshotDistributionCommand.js`) or a source-level
// confirmation that the wiring described above genuinely exists in
// `ui/main.js`/`ui/views/DecentralizedPublicationsView.js`.
//
// See tests/RemoteIpfsDistributionIntegrationBoundaryAudit.test.js (0.9.662)
// for the audit this milestone's own production change closes — that
// file's own Section B7/H are amended in place, marking exactly what
// 0.9.663 changed. This file is the closure: does the wiring actually work,
// end to end, against the real collaborators, under every case the
// requesting brief named (A-H)?
//
//   A. Successful distribution: Remote upload -> CID -> Nostr publisher,
//      same content identity throughout.
//   B. Failure isolation: a Remote IPFS failure produces zero Nostr
//      publications.
//   C. Exactly-once: one successful Remote IPFS publication produces
//      exactly one Nostr publication.
//   D. Existing Kubo path: a regression guard, unchanged.
//   E. Existing Arweave path: a regression guard, unchanged.
//   F. UI state: `IpfsPublicationRecord` construction is unchanged; the
//      Nostr outcome is never folded into it.
//   G. No premature announcement: the publisher is reached only after a
//      real PUBLISHED outcome.
//   H. Cross-instance discovery: an independent query service instance,
//      sharing only the fake relay network, discovers the announcement.

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

// Mirrors tests/RemoteIpfsDistributionIntegrationBoundaryAudit.test.js's own
// fake pinning provider exactly — never cross-imported, per this codebase's
// own "kept deliberately separate" restraint for test-only fixtures.
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

function makeFakeArweaveShapedContentStore({ network = new Map() } = {}) {
    let seq = 0;
    return {
        storage: 'ar',
        async put(bytes) {
            const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
            const hash = computeContentHash(text);
            const txId = `arfake${++seq}`;
            network.set(txId, text);
            return { hash, algorithm: 'fnv1a-32', mediaType: 'application/json', size: text.length, uri: `ar://${txId}`, storage: 'ar' };
        },
        async get() { throw new Error('fake Arweave store: get() not exercised by this audit'); }
    };
}

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
        async get() { throw new Error('fake Kubo store: get() not exercised by this audit'); }
    };
}

// A tiny shared, in-memory Nostr relay: one Map, keyed by relayUrl, of
// published events — the identical publishImpl/queryImpl SHAPE
// application/NostrSnapshotDiscoveryPublisher.js/application/
// NostrSnapshotDiscoveryQueryService.js already require, standing in only
// for a real relay's own network boundary. Sections A/B/C/G bind a
// publisher to it; Section H binds an INDEPENDENT query service to the
// SAME bus, never the same publisher instance, to prove cross-instance
// discovery rather than same-object introspection.
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
        },
        eventCountFor(relayUrl) {
            return (relays.get(relayUrl) || []).length;
        }
    };
}

// Mirrors ui/views/DecentralizedPublicationsView.js#publishToRemoteIpfs()'s
// own real sequencing — verified against that file's actual, current
// source in Section A1/G1 below, never assumed. Never re-implements either
// collaborator's own logic: `coordinator.publish()` and
// `snapshotDiscoveryPublisher.publish()` are the real, unmodified
// production classes: this harness only reproduces the SAME call order and
// the SAME `state === PUBLISHED` gate the production function itself uses.
async function simulatePublishToRemoteIpfsSequence({ coordinator, snapshotDiscoveryPublisher, bytes, configuration }) {
    const outcome = await coordinator.publish({ bytes, configuration });
    let announcement = null;
    let announcementError = null;
    if (outcome.state === IpfsRemotePublicationState.PUBLISHED && snapshotDiscoveryPublisher) {
        try {
            announcement = await snapshotDiscoveryPublisher.publish({
                contentHash: outcome.contentHash,
                locator: outcome.locator,
                storage: 'ipfs'
            });
        } catch (error) {
            announcementError = error.message;
        }
    }
    return { outcome, announcement, announcementError };
}

async function run() {

    // =======================================================================
    // Section A — Successful distribution.
    // =======================================================================
    {
        // A1 — confirm, against the REAL, current source, that
        // publishToRemoteIpfs() genuinely makes exactly this call, in
        // exactly this shape, reached only from inside the PUBLISHED
        // branch — never assumed, always checked against production.
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const fnMatch = viewSource.match(/async function publishToRemoteIpfs\(entry\) \{[\s\S]*?\n        \}/);
        assert(fnMatch, n('A1. ui/views/DecentralizedPublicationsView.js#publishToRemoteIpfs() exists as a real, isolable function.'));
        const fnBody = fnMatch[0];
        const publishedBranchMatch = fnBody.match(/if \(entry\.ipfsRemotePublicationOutcome\.state === IpfsRemotePublicationState\.PUBLISHED\) \{[\s\S]*\n                \}/);
        assert(publishedBranchMatch, n('A2. that function still gates its post-publish work behind exactly `if (entry.ipfsRemotePublicationOutcome.state === IpfsRemotePublicationState.PUBLISHED)`.'));
        const publishedBranch = publishedBranchMatch[0];
        assert(/snapshotDiscoveryPublisher\.publish\(\{\s*contentHash: entry\.ipfsRemotePublicationOutcome\.contentHash,\s*locator: entry\.ipfsRemotePublicationOutcome\.locator,\s*storage: 'ipfs'\s*\}\)/.test(publishedBranch),
            n('A3. FLAGSHIP SOURCE PROOF: inside that exact branch, publishToRemoteIpfs() calls snapshotDiscoveryPublisher.publish() with the coordinator\'s OWN contentHash/locator (never re-derived) and a hardcoded storage:\'ipfs\' (Remote Pinning\'s own self-reported name) — never a publicationId with no matching claimedPosition, which core/SnapshotDiscoveryEnvelope.js\'s own describeSnapshotDiscoveryEnvelope() would silently refuse (Section G\'s own G6 reconfirms this live).'));

        const mainSource = await source('ui/main.js');
        assert(/app\.provide\('snapshotDiscoveryPublisher', snapshotDiscoveryPublisher\)/.test(mainSource),
            n('A4. ui/main.js provides that exact `snapshotDiscoveryPublisher` variable under the key `snapshotDiscoveryPublisher` — the SAME variable, one statement above, destructured from composeSnapshotDistributionRuntime() and already used to build `snapshotDistributionCommand` for Kubo/Arweave — never a second construction.'));

        // A5 — live run: a real coordinator, a real publisher, sharing
        // only a fake relay/pinning network boundary, run through the
        // EXACT sequence A3 just confirmed production performs.
        const network = new Map();
        const relayBus = makeFakeNostrRelayBus();
        const coordinator = new IpfsRemotePublicationCoordinator({ createPinningProvider: () => makeFakePinningProvider({ network }) });
        const snapshotDiscoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relayBus.publishImpl });

        const { outcome, announcement } = await simulatePublishToRemoteIpfsSequence({
            coordinator, snapshotDiscoveryPublisher,
            bytes: JSON.stringify({ world: 'section-a-success' }),
            configuration: { endpoint: 'https://pin.example/api/add' }
        });

        assert(outcome.state === IpfsRemotePublicationState.PUBLISHED, n('A6. the Remote IPFS upload genuinely succeeds.'));
        assert(announcement && announcement.published === true, n('A7. ...and a genuine Nostr announcement follows, through the real NostrSnapshotDiscoveryPublisher.'));
        assert(relayBus.eventCountFor(NostrSnapshotDiscoveryPublisher.DEFAULT_RELAY_URL) === 1, n('A8. exactly one event reached the relay.'));

        const publishedEvent = JSON.parse(
            (await relayBus.queryImpl(NostrSnapshotDiscoveryPublisher.DEFAULT_RELAY_URL, { kinds: [1], '#t': ['forkbuild-snapshot'] }))[0].content
        );
        assert(publishedEvent.contentHash === outcome.contentHash && publishedEvent.locator === outcome.locator && publishedEvent.storage === 'ipfs',
            n('A9. CONTENT IDENTITY: the announced envelope carries the EXACT same contentHash/locator the Remote IPFS coordinator produced, plus storage:\'ipfs\' — a second replica reading this envelope learns precisely where the Remote-IPFS-pinned bytes claim to be retrievable from.'));
        assert(publishedEvent.publicationId === undefined, n('A10. ...and carries no publicationId/claimedPosition at all — the identical five-key envelope shape every pre-0.9.171 announcement already produces.'));
    }
    console.log('✓ Section A: Remote upload -> CID -> Nostr publisher, confirmed both by source (the real publishToRemoteIpfs() genuinely makes this call, gated exactly as required) and by a live run of the real collaborators — the announced envelope\'s content identity matches the Remote IPFS coordinator\'s own PUBLISHED outcome exactly.');

    // =======================================================================
    // Section B — Failure isolation.
    // =======================================================================
    {
        const network = new Map();
        const relayBus = makeFakeNostrRelayBus();
        const coordinator = new IpfsRemotePublicationCoordinator({ createPinningProvider: () => makeFakePinningProvider({ network, shouldReject: true }) });
        const snapshotDiscoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relayBus.publishImpl });

        const { outcome, announcement } = await simulatePublishToRemoteIpfsSequence({
            coordinator, snapshotDiscoveryPublisher,
            bytes: JSON.stringify({ world: 'section-b-failure' }),
            configuration: { endpoint: 'https://pin.example/api/add' }
        });

        assert(outcome.state === IpfsRemotePublicationState.REJECTED, n('B1. a provider that definitely refuses produces a genuine REJECTED outcome, never PUBLISHED.'));
        assert(announcement === null, n('B2. ZERO Nostr publications follow a failed Remote IPFS upload — the announce call is never reached.'));
        assert(relayBus.eventCountFor(NostrSnapshotDiscoveryPublisher.DEFAULT_RELAY_URL) === 0, n('B3. the relay itself received nothing at all.'));
    }
    console.log('✓ Section B: a forced Remote IPFS failure (REJECTED) produces exactly zero Nostr publications — confirmed both by the returned announcement being null and by the relay\'s own event count staying at zero.');

    // =======================================================================
    // Section C — Exactly-once behavior.
    // =======================================================================
    {
        const network = new Map();
        const relayBus = makeFakeNostrRelayBus();
        const coordinator = new IpfsRemotePublicationCoordinator({ createPinningProvider: () => makeFakePinningProvider({ network }) });
        const snapshotDiscoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relayBus.publishImpl });

        const first = await simulatePublishToRemoteIpfsSequence({
            coordinator, snapshotDiscoveryPublisher,
            bytes: JSON.stringify({ world: 'section-c-first' }),
            configuration: { endpoint: 'https://pin.example/api/add' }
        });
        assert(first.outcome.state === IpfsRemotePublicationState.PUBLISHED && first.announcement !== null,
            n('C1. the first publish attempt succeeds and announces.'));
        assert(relayBus.eventCountFor(NostrSnapshotDiscoveryPublisher.DEFAULT_RELAY_URL) === 1,
            n('C2. exactly one Nostr publication exists after exactly one successful Remote IPFS publication.'));

        // A SECOND, independent publish attempt for the SAME entry (mirroring
        // publishToRemoteIpfs()'s own re-publish support: a fresh click
        // starts a fresh attempt) produces its OWN second announcement —
        // never zero (already covered), and never two for one attempt.
        const second = await simulatePublishToRemoteIpfsSequence({
            coordinator, snapshotDiscoveryPublisher,
            bytes: JSON.stringify({ world: 'section-c-second' }),
            configuration: { endpoint: 'https://pin.example/api/add' }
        });
        assert(second.outcome.state === IpfsRemotePublicationState.PUBLISHED && second.announcement !== null,
            n('C3. a second, independent publish attempt also succeeds and announces.'));
        assert(relayBus.eventCountFor(NostrSnapshotDiscoveryPublisher.DEFAULT_RELAY_URL) === 2,
            n('C4. the relay now holds exactly two events — one per successful publish, never a duplicate for either.'));
    }
    console.log('✓ Section C: one successful Remote IPFS publication produces exactly one Nostr publication — reconfirmed across two independent, sequential publish attempts, with the relay\'s own event count advancing by exactly one each time.');

    // =======================================================================
    // Section D — Existing Kubo path (regression guard).
    // =======================================================================
    {
        const mainSource = await source('ui/main.js');
        // AMENDED — a later, separate milestone added relay-resilience
        // fan-out to this exact call site (relayUrls: resolvedNostrRelayUrls),
        // unrelated to Remote IPFS. D1 now checks the invariant THIS
        // milestone's own scope actually cares about: publishImpl/discoveryTag
        // remain the SAME nostrHostPublisher/'forkbuild-snapshot' this
        // milestone's own Section A-C already exercise — never rewritten by
        // Remote IPFS support.
        assert(/const { discoveryPublisher: snapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime\(\{\s*nostrSnapshotDiscoveryPublisherOptions: \{ publishImpl: nostrHostPublisher, discoveryTag: 'forkbuild-snapshot', relayUrls: resolvedNostrRelayUrls \}\s*\}\);/.test(mainSource),
            n('D1. ui/main.js\'s own snapshotDiscoveryPublisher composition still uses the SAME publishImpl/discoveryTag this milestone relies on — relayUrls is a later, unrelated relay-resilience addition, not a Remote IPFS change.'));
        assert(/const snapshotDistributionCommand = \(bytes, storage = 'ar', publicationId, claimedPosition\) => executeSnapshotDistributionCommand\(\{\s*bytes,\s*contentStore: resolveSnapshotDistributionContentStore\(snapshotPlacementStoreRegistry, storage\),\s*discoveryPublisher: snapshotDiscoveryPublisher,\s*publicationId,\s*claimedPosition\s*\}\);/.test(mainSource),
            n('D2. ...and the existing snapshotDistributionCommand closure Kubo\'s own "Distribute Snapshot" action calls is likewise byte-for-byte unchanged — this milestone only ADDS one new app.provide() line after it, never edits it.'));

        // Live regression run — the identical Kubo journey tests/
        // RemoteIpfsDistributionIntegrationBoundaryAudit.test.js's own
        // Section A already certified, reconfirmed here untouched by this
        // milestone's own production change.
        const relayBus = makeFakeNostrRelayBus();
        const kuboStore = makeFakeKuboContentStore();
        const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relayBus.publishImpl });
        const bytes = JSON.stringify({ world: 'section-d-kubo-regression' });
        const result = await executeSnapshotDistributionCommand({ bytes, contentStore: kuboStore, discoveryPublisher });

        assert(result.contentReference.uri.startsWith('ipfs://'), n('D3. the Kubo journey still produces a genuine ipfs:// ContentReference.'));
        assert(result.announcement && result.announcement.published === true, n('D4. ...and a genuine Nostr announcement, unaffected by Remote IPFS\'s own new call site sharing the same publisher class/instance shape.'));
    }
    console.log('✓ Section D: the existing Kubo distribution path is a pure regression guard here — ui/main.js\'s own snapshotDiscoveryPublisher/snapshotDistributionCommand composition is textually unchanged, and a live run through executeSnapshotDistributionCommand() with a Kubo-shaped store still succeeds exactly as before.');

    // =======================================================================
    // Section E — Existing Arweave path (regression guard).
    // =======================================================================
    {
        const mainSource = await source('ui/main.js');
        assert(/storage = 'ar'/.test(mainSource), n('E1. snapshotDistributionCommand still defaults storage to \'ar\' — unchanged.'));

        // Live regression run: an Arweave-SHAPED content store (never a
        // real ArweaveContentStore, which needs a live signer — the same
        // "fake only the network boundary" restraint every fixture in this
        // file already holds) fed through the SAME, completely unmodified
        // executeSnapshotDistributionCommand(), with the SAME discovery
        // publisher CLASS Remote IPFS's own new call site now also uses.
        const relayBus = makeFakeNostrRelayBus();
        const arweaveStore = makeFakeArweaveShapedContentStore();
        const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relayBus.publishImpl });
        const bytes = JSON.stringify({ world: 'section-e-arweave-regression' });
        const result = await executeSnapshotDistributionCommand({ bytes, contentStore: arweaveStore, discoveryPublisher });

        assert(result.contentReference.uri.startsWith('ar://') && result.contentReference.storage === 'ar',
            n('E2. the Arweave journey still produces a genuine ar:// ContentReference.'));
        assert(result.announcement && result.announcement.published === true,
            n('E3. ...and a genuine Nostr announcement — sharing a discovery publisher CLASS with the new Remote IPFS call site changes nothing about how the Arweave path itself behaves; each call site still owns its own arguments.'));
    }
    console.log('✓ Section E: the existing Arweave distribution path is likewise unaffected — snapshotDistributionCommand still defaults to \'ar\', and a live run through the same unmodified command with an Arweave-shaped store succeeds exactly as before.');

    // =======================================================================
    // Section F — UI state: one source of truth, never two.
    // =======================================================================
    {
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const fnMatch = viewSource.match(/async function publishToRemoteIpfs\(entry\) \{[\s\S]*?\n        \}/);
        const fnBody = fnMatch[0];

        // F1 — the IpfsPublicationRecord construction itself is untouched:
        // still exactly contentHash/locator/publishedAt/publicationMethod,
        // still sourced only from the coordinator's own PUBLISHED outcome.
        assert(/entry\.ipfsPublicationRecord = new IpfsPublicationRecord\(\{\s*contentHash: entry\.ipfsRemotePublicationOutcome\.contentHash,\s*locator: entry\.ipfsRemotePublicationOutcome\.locator,\s*publishedAt: entry\.ipfsRemotePublicationOutcome\.publishedAt,\s*publicationMethod: IpfsPublicationMethod\.REMOTE_PINNING\s*\}\);/.test(fnBody),
            n('F1. entry.ipfsPublicationRecord is still constructed with exactly its pre-0.9.663 four fields — the Nostr announcement introduces no new field on this object, and no new constructor argument.'));

        // F2 — the Nostr outcome is recorded on a SEPARATE entry field,
        // never merged into ipfsPublicationRecord or its history/archive.
        assert(/entry\.ipfsRemoteSnapshotAnnouncement = \{ announced: announcement !== null, announcement, error: null \};/.test(fnBody),
            n('F2. the Nostr announcement outcome is recorded on its own, separate `entry.ipfsRemoteSnapshotAnnouncement` field — never folded into `entry.ipfsPublicationRecord`.'));
        assert(!/IpfsPublicationRecord\(\{[\s\S]{0,400}announcement/.test(fnBody),
            n('F3. IpfsPublicationRecord\'s own constructor call carries no announcement-shaped argument anywhere near it.'));

        // F4 — application/IpfsPublicationRecord.js itself: this milestone
        // touches it not at all. Its constructor still accepts exactly the
        // pre-existing four named fields — constructing one with a fifth,
        // unrecognized field is silently ignored (never throws, never
        // stored), confirming this class did not grow a new concept.
        const record = new IpfsPublicationRecord({
            contentHash: computeContentHash('f4-check'), locator: 'ipfs://bafyf4check', publishedAt: new Date(),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING,
            announcement: { published: true, id: 'should-be-ignored' }
        });
        assert(record.toJSON().announcement === undefined, n('F4. IpfsPublicationRecord genuinely has no concept of an announcement — an extraneous constructor field is silently dropped, never surfaced from toJSON().'));

        // F5 — the history/archive machinery this milestone leaves alone:
        // still appended with the SAME record, nothing else.
        assert(/appendIpfsPublicationRecordHistoryEntry\(\s*entry\.ipfsPublicationRecordHistory, entry\.ipfsPublicationRecord\s*\)/.test(fnBody),
            n('F5. the append-only publication history still archives exactly entry.ipfsPublicationRecord, unchanged.'));
    }
    console.log('✓ Section F: entry.ipfsPublicationRecord\'s own construction, history, and archival are byte-for-byte unchanged — the new Nostr announcement outcome lives on its own, separate entry.ipfsRemoteSnapshotAnnouncement field, confirmed both by source and by a live IpfsPublicationRecord construction proving that class has no concept of an announcement to begin with.');

    // =======================================================================
    // Section G — No premature announcement.
    // =======================================================================
    {
        // G1 — source: the announce call lives strictly INSIDE the
        // `if (... === PUBLISHED)` branch, never before it, never in the
        // outer catch, and never unconditionally.
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const fnMatch = viewSource.match(/async function publishToRemoteIpfs\(entry\) \{[\s\S]*?\n        \}/);
        const fnBody = fnMatch[0];
        const publishedIndex = fnBody.indexOf('if (entry.ipfsRemotePublicationOutcome.state === IpfsRemotePublicationState.PUBLISHED)');
        const announceIndex = fnBody.indexOf('snapshotDiscoveryPublisher.publish({');
        const catchIndex = fnBody.lastIndexOf('} catch (error) {');
        assert(publishedIndex !== -1 && announceIndex !== -1 && catchIndex !== -1,
            n('G1. all three landmarks (the PUBLISHED gate, the announce call, the outer catch) are present in publishToRemoteIpfs()\'s own current source.'));
        assert(publishedIndex < announceIndex && announceIndex < catchIndex,
            n('G2. and appear in exactly that order — the announce call is textually INSIDE the PUBLISHED branch, strictly before the outer catch that would otherwise convert a thrown error here into a FAILED Remote IPFS outcome.'));

        // G3 — live: a coordinator whose outcome never reaches PUBLISHED
        // (UNAVAILABLE, this time, for variety against Section B's own
        // REJECTED) — count calls to publishImpl directly via a counting
        // wrapper around the real relay bus, proving publishImpl itself is
        // never invoked, not merely that its return value is unused.
        const relayBus = makeFakeNostrRelayBus();
        let publishImplCalls = 0;
        const countingPublishImpl = async (relayUrl, eventTemplate) => {
            publishImplCalls += 1;
            return relayBus.publishImpl(relayUrl, eventTemplate);
        };
        const snapshotDiscoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: countingPublishImpl });
        const { ContentUnavailableError } = await import('../content/IpfsContentStore.js');
        const unavailableProvider = { async put() { throw new ContentUnavailableError('fake-provider: unreachable'); } };
        const coordinator = new IpfsRemotePublicationCoordinator({ createPinningProvider: () => unavailableProvider });

        const { outcome, announcement } = await simulatePublishToRemoteIpfsSequence({
            coordinator, snapshotDiscoveryPublisher,
            bytes: JSON.stringify({ world: 'section-g-unavailable' }),
            configuration: { endpoint: 'https://pin.example/api/add' }
        });
        assert(outcome.state === IpfsRemotePublicationState.UNAVAILABLE, n('G4. the provider being unreachable produces UNAVAILABLE, never PUBLISHED.'));
        assert(announcement === null && publishImplCalls === 0,
            n('G5. FLAGSHIP: publishImpl itself was never invoked — not merely "no announcement was returned" but the underlying relay call never happened at all, for an outcome that never reached PUBLISHED.'));
    }
    console.log('✓ Section G: the publisher is reached only after a genuine PUBLISHED outcome — confirmed by source (the announce call sits strictly inside the PUBLISHED branch, before the outer catch) and live (an UNAVAILABLE outcome never invokes the underlying relay publishImpl at all, zero times, not merely zero successful announcements).');

    // =======================================================================
    // Section H — Cross-instance discovery, the actual user-value boundary.
    // =======================================================================
    {
        const network = new Map();
        const relayBus = makeFakeNostrRelayBus();

        // The PUBLISHING instance — exactly Section A's own shape, standing
        // in for the ForkBuild instance that performed "Publish to Remote
        // IPFS."
        const coordinator = new IpfsRemotePublicationCoordinator({ createPinningProvider: () => makeFakePinningProvider({ network }) });
        const publishingInstancePublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', publishImpl: relayBus.publishImpl });

        const { outcome, announcement } = await simulatePublishToRemoteIpfsSequence({
            coordinator, snapshotDiscoveryPublisher: publishingInstancePublisher,
            bytes: JSON.stringify({ world: 'section-h-cross-instance' }),
            configuration: { endpoint: 'https://pin.example/api/add' }
        });
        assert(outcome.state === IpfsRemotePublicationState.PUBLISHED && announcement !== null,
            n('H1. the publishing instance\'s own Remote IPFS publication succeeds and announces.'));

        // The DISCOVERING instance — a COMPLETELY INDEPENDENT
        // NostrSnapshotDiscoveryQueryService, never the publisher above,
        // never sharing any object except the fake relay's own network
        // boundary (queryImpl) — exactly what a second, independent
        // ForkBuild replica querying the same real relay would be.
        const discoveringInstanceQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: relayBus.queryImpl });
        const discovered = await discoveringInstanceQueryService.resolveLocator('forkbuild-snapshot', outcome.contentHash);

        assert(discovered === outcome.locator,
            n('H2. FLAGSHIP: an INDEPENDENT instance, holding only a contentHash and a discoveryTag — never the Remote IPFS coordinator, never the ContentReference, never anything from the publishing instance\'s own memory — discovers the EXACT locator the Remote-IPFS-pinned bytes are retrievable from. This is the actual user-value boundary this milestone closes: a person without a local Kubo node can publish through Remote IPFS and still be found by someone else\'s independent ForkBuild instance.'));

        // A negative control: an unrelated contentHash resolves to nothing
        // — this is a real discovery, not a bus that echoes anything asked.
        const notFound = await discoveringInstanceQueryService.resolveLocator('forkbuild-snapshot', computeContentHash('never-published'));
        assert(notFound === null, n('H3. a contentHash that was never announced resolves to null, not a false match.'));
    }
    console.log('✓ Section H: cross-instance discovery, live. A Remote IPFS publication, announced through the publishing instance\'s own snapshotDiscoveryPublisher, is discovered by a completely independent NostrSnapshotDiscoveryQueryService instance holding nothing but a contentHash and a discoveryTag — the actual user-value boundary: a person without a local Kubo node can now use Remote IPFS and still participate in ForkBuild\'s integrated Snapshot + Nostr distribution workflow.');

    console.log('\nAll Connect Remote IPFS to Nostr Snapshot Distribution Closure Audit tests passed.');
    console.log(
        '\nVerdict: MILESTONE_CLOSED. ' +
        'tests/RemoteIpfsDistributionIntegrationBoundaryAudit.test.js\'s (0.9.662) own NARROW_WIRING_GAP finding is\n' +
        'closed exactly as recommended: publishToRemoteIpfs() now announces a Remote IPFS PUBLISHED outcome through\n' +
        'the SAME snapshotDiscoveryPublisher instance ui/main.js already composes for Kubo/Arweave, directly, never\n' +
        'through executeSnapshotDistributionCommand() (avoiding a redundant re-upload) and never touching\n' +
        'SnapshotPlacementStoreRegistry (leaving that audit\'s own Section E registry-key-collision finding\n' +
        'untouched, as recommended). Every closure item the requesting brief named (A-H) holds: successful\n' +
        'distribution carries identical content identity through to announcement (A); a Remote IPFS failure\n' +
        'produces zero Nostr publications (B); one successful publication produces exactly one announcement,\n' +
        'reconfirmed across repeated attempts (C); the existing Kubo (D) and Arweave (E) paths are unaffected;\n' +
        'entry.ipfsPublicationRecord remains the sole local-display source of truth, with the new announcement\n' +
        'outcome on its own separate field (F); the publisher is reached only after a genuine PUBLISHED outcome,\n' +
        'confirmed live down to a zero-invocation publishImpl call count (G); and an independent query service\n' +
        'instance, sharing nothing but the relay, discovers the announced locator by contentHash alone (H) — the\n' +
        'actual product gap this milestone exists to close.'
    );
}

run().catch((error) => {
    console.error('ConnectRemoteIpfsToNostrSnapshotDistributionClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
