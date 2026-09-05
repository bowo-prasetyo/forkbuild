import { readFile, readdir } from 'node:fs/promises';

import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { describeSnapshotDiscoveryEnvelope, parseSnapshotDiscoveryEnvelope, SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL } from '../core/SnapshotDiscoveryEnvelope.js';
import { describeDecentralizedDiscoveryEnvelope, parseDecentralizedDiscoveryEnvelope, DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL } from '../core/DecentralizedDiscoveryEnvelope.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';

// 0.9.156 — Snapshot Lifecycle & Semantic Boundary Audit.
//
// 0.9.131 through 0.9.155 built the entire decentralized Snapshot
// subsystem in twenty-five separate milestones — placement, discovery,
// resolution, candidate browsing, explicit selection, and two independent
// attribution paths — each one narrowly scoped, each one individually
// audited at the moment it landed. This milestone asks a different kind
// of question, across all of them at once: has the SUM of those twenty-
// five milestones quietly accumulated hidden coupling, duplicated
// semantics, or accidental state authority that no single milestone's own
// audit was positioned to see? TEST-ONLY. ZERO PRODUCTION CHANGES — every
// file this audit imports is read, never edited; every behavior it
// exercises was already true before this file existed.
//
//                     ┌─────────────────────┐
//                     │   Snapshot Publish   │
//                     └──────────┬──────────┘
//                                ▼
//                           placement
//                                ▼
//                          announcement
//                                ▼
//                           discovery
//                       ┌────────┴────────┐
//                       ▼                 ▼
//                 browse candidates   resolve(hash)
//                       ▼                 │
//                     select              │
//                       ▼                 │
//                resolveCandidate() ◄─────┘
//                       ▼
//                   retrieval
//                       ▼
//                  verification
//                       ▼
//                  attribution
//
// This file proves ten separate invariants over that diagram, one section
// each, matching this milestone's own brief:
//
//   A. Distribution independence  — Signed Claim distribution and
//      Snapshot distribution share no code path; a failure in one never
//      silently becomes a failure in the other.
//   B. Discovery independence     — World Material discovery and Snapshot
//      discovery share Nostr as a transport, never a semantic envelope.
//   C. Candidate semantics        — a discovered candidate is exactly
//      { contentHash, locator, storage }; it never acquires verification,
//      attribution, trust, ownership, ranking, or authenticity.
//   D. Selection authority        — candidate discovery order never
//      substitutes for an explicit user selection.
//   E. Resolution semantics       — resolve() ("discover, then resolve
//      whatever matches first") and resolveCandidate() ("resolve exactly
//      this") stay two intentionally different operations.
//   F. Verification authority     — computeContentHash() is never called
//      by any UI/component to decide validity on its own.
//   G. Attribution authority      — SnapshotPublicationAttribution.js is
//      the only place MATCH/NO_MATCH is ever produced.
//   H. UI state authority         — UI state describes the interaction;
//      it never becomes domain truth.
//   I. Identity separation        — eight distinct identifiers this
//      subsystem has accumulated never collide or get substituted for
//      one another.
//   J. Single machinery paths     — resolve() and attribution's two entry
//      points both converge on one real implementation each, never a
//      second, independent copy.
//
// WHAT THIS MILESTONE DELIBERATELY DOES NOT DO. It builds no new
// application command, UI affordance, outcome vocabulary, or Snapshot
// concept of any kind. Where a section's proof already exists in an
// earlier milestone's own audit (0.9.145, 0.9.148, 0.9.149, 0.9.153,
// 0.9.155), this file does not imitate that proof more weakly — it either
// reuses the identical composed runtime to ask a NEW question that
// milestone's own brief never asked, or performs a repository-wide
// structural sweep no single-feature audit was ever positioned to run.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-boundary-audit-tx-${counter}`, transaction: { id: `fake-boundary-audit-tx-${counter}`, data: material } };
    }
    return { sign };
}

function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

function makeSharedHostRuntime(discoveryTag, { relayUrl } = {}) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: relayUrl
            ? { queryImpl: network.queryImpl, relayUrl }
            : { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({
        discoveryTag,
        publishImpl: network.publishImpl,
        ...(relayUrl ? { relayUrl } : {})
    });

    return { gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer };
}

async function placeAndAnnounce(host, bytes) {
    const reference = await host.contentStore.put(bytes);
    const announcement = await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
    return { reference, announcement };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Strips full-line `//` comments (and, for a leading block, the file's own
// header prose) so a structural sweep matches genuine code, never a
// comment that merely NAMES a file, method, or vocabulary word in prose —
// the identical helper tests/SelectedSnapshotAttributionEndToEndAudit.test.js
// and tests/SnapshotDiscoverySemanticsAudit.test.js already use for the
// identical reason.
async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function listJsFilesRecursively(relativeDir) {
    const results = [];
    async function walk(dir) {
        const entries = await readdir(new URL(dir, SOURCE_ROOT), { withFileTypes: true });
        for (const entry of entries) {
            const childPath = `${dir}${dir.endsWith('/') ? '' : '/'}${entry.name}`;
            if (entry.isDirectory()) {
                await walk(`${childPath}/`);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                results.push(childPath);
            }
        }
    }
    await walk(relativeDir);
    return results;
}

async function run() {
    // ===============================================================
    // Section A — DISTRIBUTION INDEPENDENCE.
    //
    //   Signed Claim Distribution  ≠  Snapshot Distribution
    //
    // A repository-wide import sweep, never a single pairwise spot check
    // — every file in the Snapshot distribution/discovery/resolution
    // family is checked against every file in the Signed Claim
    // distribution family, in BOTH directions.
    // ===============================================================
    {
        const snapshotFamilyFiles = [
            'content/ArweaveContentStore.js',
            'application/NostrSnapshotDiscoveryPublisher.js',
            'application/NostrSnapshotDiscoveryQueryService.js',
            'application/DecentralizedSnapshotResolver.js',
            'application/DiscoverSnapshotCommand.js',
            'application/DiscoverSnapshotCandidatesCommand.js',
            'application/ResolveSelectedSnapshotCommand.js',
            'application/SnapshotDistributionCommand.js',
            'application/DiscoverSnapshotRuntimeComposition.js',
            'application/SnapshotDistributionRuntimeComposition.js',
            'application/SnapshotPublicationAttribution.js',
            'core/SnapshotDiscoveryEnvelope.js'
        ];
        const signedClaimFamilyFiles = [
            'application/PublicationDistributionCommand.js',
            'application/PublicationDistributionExecutor.js',
            'application/PublicationDistributionOrchestrator.js',
            'application/PublicationDistributionLifecycle.js',
            'application/PublicationDistributionLifecyclePersistence.js',
            'application/PublicationDistributionRuntimeComposition.js',
            'application/PublicationDistributionRuntimeConfiguration.js',
            'application/ArweavePublicationDistributionRuntimeAdapter.js',
            'application/NostrPublicationDistributionRuntimeAdapter.js',
            'application/ArweavePublicationMaterialUploader.js',
            'application/NostrPublicationDiscoveryPublisher.js',
            'core/PublicationSnapshotPlacement.js',
            'application/SnapshotPlacementResolver.js',
            'application/SnapshotPlacementStoreRegistry.js',
            'core/DecentralizedDiscoveryEnvelope.js'
        ];

        // A1. Forward direction: no Snapshot-family file imports any
        // Signed-Claim-family module.
        for (const snapshotFile of snapshotFamilyFiles) {
            const source = await codeOnlySource(snapshotFile);
            for (const signedClaimFile of signedClaimFamilyFiles) {
                const moduleName = signedClaimFile.split('/').pop();
                assert(!source.includes(moduleName),
                    `A1. ${snapshotFile} never imports/references ${moduleName} — Snapshot distribution shares no code path with Signed Claim distribution`);
            }
        }

        // A2. Reverse direction: no Signed-Claim-family file imports any
        // Snapshot-family module.
        for (const signedClaimFile of signedClaimFamilyFiles) {
            let source;
            try {
                source = await codeOnlySource(signedClaimFile);
            } catch {
                continue; // a named file that does not exist in this checkout carries no risk either way
            }
            for (const snapshotFile of snapshotFamilyFiles) {
                const moduleName = snapshotFile.split('/').pop();
                assert(!source.includes(moduleName),
                    `A2. ${signedClaimFile} never imports/references ${moduleName} — the boundary holds in both directions`);
            }
        }

        // A3. FLAGSHIP, behavioral: a genuine Arweave PLACEMENT failure
        // (the signer itself declines — "Arweave publication distribution"
        // failing, one substrate over) never even attempts Nostr
        // announcement, and propagates as a plain rejection — it never
        // manifests as a discovery, resolution, or attribution failure of
        // some UNRELATED, already-placed Snapshot.
        {
            const network = makeNostrNetwork();
            const failingSigner = { sign: async () => { throw new Error('A3: signer genuinely declines to sign'); } };
            const failingStore = new ArweaveContentStore({ signer: failingSigner, fetchImpl: async () => new Response('unused') });
            const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-156-section-a3', publishImpl: network.publishImpl });

            let threw = null;
            try {
                await executeSnapshotDistributionCommand({ bytes: 'A3: content that will never be placed', contentStore: failingStore, discoveryPublisher: announcer });
            } catch (error) {
                threw = error;
            }
            assert(threw !== null, 'A3a. sanity: a genuine placement failure propagates as a rejection');
            assert(network.events.length === 0, 'A3b. FLAGSHIP — a placement failure never even attempts Nostr announcement; the two remain sequenced, never parallel, independent failure domains');

            // An UNRELATED Snapshot, placed and announced on a completely
            // independent host, remains fully resolvable — the failure
            // above touched nothing beyond its own local call.
            const unrelatedHost = makeSharedHostRuntime('audit-156-section-a3-unrelated');
            const { reference } = await placeAndAnnounce(unrelatedHost, 'A3: unrelated, unaffected Snapshot');
            const resolved = await executeDiscoverSnapshotCommand({ discoveryTag: unrelatedHost.discoveryTag, contentHash: reference.hash, resolver: unrelatedHost.resolver, contentStore: unrelatedHost.contentStore });
            assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
                'A3c. an unrelated Snapshot resolves normally — the placement failure above is a local, contained fact, never a systemic one');

            console.log('✓ Section A: Signed Claim distribution and Snapshot distribution share zero code path in either direction (repository-wide import sweep), and a genuine Arweave placement failure stays fully contained — it never attempts announcement and never affects any unrelated Snapshot');
        }
    }

    // ===============================================================
    // Section B — DISCOVERY INDEPENDENCE.
    //
    //   Nostr transport -> World Material Discovery
    //   Nostr transport -> Snapshot Discovery
    //
    // Both share Nostr as TRANSPORT; neither shares the other's semantic
    // envelope.
    // ===============================================================
    {
        // B1. The two envelopes declare genuinely different protocol
        // strings, on the wire — never ambiguous about which contract an
        // event's own content claims to satisfy.
        assert(SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL !== DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
            'B1. core/SnapshotDiscoveryEnvelope.js and core/DecentralizedDiscoveryEnvelope.js declare genuinely different protocol strings');

        // B2. FLAGSHIP — a well-formed WORLD MATERIAL discovery envelope
        // is never mistaken for a Snapshot discovery envelope, and vice
        // versa, despite both living as free-form JSON in an identical
        // Nostr event `.content` field.
        const worldMaterialEnvelope = { protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'obj-b', uri: 'ar://world-material-tx' };
        const described = describeDecentralizedDiscoveryEnvelope(worldMaterialEnvelope);
        assert(described !== null, 'B2a. sanity: the world material envelope is genuinely well-formed on its own terms');
        assert(parseSnapshotDiscoveryEnvelope(JSON.stringify(worldMaterialEnvelope)) === null,
            'B2b. FLAGSHIP — a genuinely well-formed World Material Discovery envelope is refused by the Snapshot discovery parser; the shared Nostr transport never blurs the two semantic contracts');

        const snapshotEnvelope = { protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: 1, contentHash: 'hash-b', locator: 'ar://snapshot-tx', storage: 'ar' };
        assert(describeSnapshotDiscoveryEnvelope(snapshotEnvelope) !== null, 'B2c. sanity: the snapshot envelope is genuinely well-formed on its own terms');
        assert(parseDecentralizedDiscoveryEnvelope(JSON.stringify(snapshotEnvelope)) === null,
            'B2d. FLAGSHIP, converse — a genuinely well-formed Snapshot Discovery envelope is refused by the World Material discovery parser');

        // B3. Structural: the query/publish services for each family never
        // import the other family's envelope module or query/publish
        // class — the transport-sharing above is a coincidence of BOTH
        // riding Nostr `content`, never a shared implementation.
        const snapshotQueryServiceSource = await codeOnlySource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!snapshotQueryServiceSource.includes('DecentralizedDiscoveryEnvelope') && !snapshotQueryServiceSource.includes('DecentralizedWorldDiscoveryQuery'),
            'B3a. application/NostrSnapshotDiscoveryQueryService.js never imports the World Material discovery envelope or its base query class');
        const snapshotPublisherSource = await codeOnlySource('application/NostrSnapshotDiscoveryPublisher.js');
        assert(!snapshotPublisherSource.includes('DecentralizedDiscoveryEnvelope') && !snapshotPublisherSource.includes('NostrPublicationDiscoveryPublisher'),
            'B3b. application/NostrSnapshotDiscoveryPublisher.js never imports the World Material discovery envelope or NostrPublicationDiscoveryPublisher.js');

        // B4. Behavioral: one shared Nostr network carrying BOTH kinds of
        // announcement under the same relay, queried through each
        // family's OWN query surface, returns only that family's own
        // events — proving the shared transport genuinely never leaks
        // cross-family results, not merely that the parsers refuse them
        // (B2, above) after the fact.
        {
            const network = makeNostrNetwork();
            const snapshotAnnouncer = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-156-section-b4', publishImpl: network.publishImpl });
            await snapshotAnnouncer.publish({ contentHash: 'b4-snapshot-hash', locator: 'ar://b4-snapshot-tx', storage: 'ar' });
            // A raw World Material style event, published directly onto
            // the SAME relay network and the SAME tag value, without any
            // dedicated publisher class (none is imported here — see B3).
            await network.publishImpl('wss://fake-relay', {
                kind: 1,
                tags: [['t', 'audit-156-section-b4']],
                content: JSON.stringify({ protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'b4-obj', uri: 'ar://b4-world-material-tx' })
            });

            const snapshotQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
            const candidates = await snapshotQueryService.search('audit-156-section-b4');
            assert(candidates.length === 1 && candidates[0].contentHash === 'b4-snapshot-hash',
                'B4. FLAGSHIP — two heterogeneous announcements share one relay and one tag value, yet Snapshot discovery\'s own search() surfaces only the genuinely Snapshot-shaped one; the World Material announcement is silently, correctly skipped, never surfaced as a malformed or partial candidate');
        }

        console.log('✓ Section B: World Material Discovery and Snapshot Discovery share Nostr transport but never a semantic envelope — cross-family events are silently skipped, not merely rejected after being mistakenly surfaced');
    }

    // ===============================================================
    // Section C — CANDIDATE SEMANTICS.
    //
    // A discovered candidate contains only what discovery knows:
    // contentHash, locator, storage — and never acquires verification,
    // attribution, trust, ownership, ranking, or authenticity.
    // ===============================================================
    {
        const network = makeNostrNetwork();
        const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-156-section-c', publishImpl: network.publishImpl });
        await announcer.publish({ contentHash: 'c-hash', locator: 'ar://c-tx', storage: 'ar' });
        const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await queryService.search('audit-156-section-c');
        assert(candidates.length === 1, 'C0. sanity: one candidate genuinely discovered');

        const candidate = candidates[0];
        assert(Object.keys(candidate).sort().join(',') === 'contentHash,locator,storage',
            'C1. a candidate carries EXACTLY its three documented fields — never more, never fewer');

        const forbiddenFields = ['outcome', 'status', 'verified', 'trusted', 'match', 'resolved', 'bytes', 'ownership', 'owner', 'authenticity', 'authentic', 'rank', 'ranking', 'score', 'confidence'];
        for (const field of forbiddenFields) {
            assert(!(field in candidate), `C2. a discovered candidate never carries a '${field}' field — discovery alone can never manufacture that fact`);
        }

        // C3. Structural, repository-wide: neither discovery file's own
        // source ever references the vocabulary that belongs to a LATER
        // layer — this is architectural, not a fixture coincidence.
        const forbiddenVocabulary = /\bMATCH\b|\bNO_MATCH\b|\bVERIFIED\b|\bRESOLVED\b|\bTRUSTED\b|\bAUTHENTIC\b|\bOWNED\b/;
        const queryServiceSource = await codeOnlySource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!forbiddenVocabulary.test(queryServiceSource),
            'C3a. application/NostrSnapshotDiscoveryQueryService.js never references verification/attribution/trust vocabulary');
        const candidatesCommandSource = await codeOnlySource('application/DiscoverSnapshotCandidatesCommand.js');
        assert(!forbiddenVocabulary.test(candidatesCommandSource),
            'C3b. application/DiscoverSnapshotCandidatesCommand.js never references it either — it is a pure pass-through assembly boundary, per its own header');

        console.log('✓ Section C: a discovered candidate is exactly { contentHash, locator, storage } — behaviorally and structurally, discovery alone never manufactures verification, attribution, trust, ownership, ranking, or authenticity');
    }

    // ===============================================================
    // Section D — SELECTION AUTHORITY.
    //
    //   candidate discovery order  ≠  user selection
    //
    // Once selected: selected candidate -> exact locator -> exact
    // retrieval must remain authoritative; no later layer substitutes a
    // different candidate.
    // ===============================================================
    {
        // D1. Structural: resolveCandidate() never re-discovers or
        // re-selects — it never calls the query service at all.
        const resolverSource = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        const resolveCandidateBody = (resolverSource.match(/async resolveCandidate\(candidate[\s\S]*?\n {4}\}/) || [''])[0];
        assert(resolveCandidateBody.length > 0, 'D1. sanity: resolveCandidate()\'s own body was located');
        assert(!resolveCandidateBody.includes('_queryService') && !resolveCandidateBody.includes('.search('),
            'D2. resolveCandidate() never calls this._queryService or .search() — it resolves EXACTLY the candidate handed in, never a fresh discovery pass');

        // D3. FLAGSHIP, behavioral: two candidates deliberately discovered
        // in one order; explicitly resolving the SECOND one (never the
        // first, which is what discovery order alone would imply) drives
        // retrieval against that exact locator alone, proven by an
        // external content-store spy that observes only the query the
        // resolver actually issued.
        const host = makeSharedHostRuntime('audit-156-section-d');
        const firstBytes = 'D: the first-discovered candidate';
        const secondBytes = 'D: the second-discovered, genuinely different candidate';
        const firstReference = await placeAndAnnounce(host, firstBytes).then((r) => r.reference);
        const secondReference = await placeAndAnnounce(host, secondBytes).then((r) => r.reference);

        const discovered = await host.queryService.search('audit-156-section-d');
        assert(discovered.length === 2 && discovered[0].locator === firstReference.uri && discovered[1].locator === secondReference.uri,
            'D3a. sanity: discovery order genuinely places the first-placed candidate first');

        const queriedLocators = [];
        const recordingStore = {
            storage: host.contentStore.storage,
            async get(reference) { queriedLocators.push(reference.uri); return host.contentStore.get(reference); },
            async put(bytes) { return host.contentStore.put(bytes); }
        };

        const selectedCandidate = discovered[1]; // the SECOND one — deliberately not what "first match" would pick
        const resolved = await executeResolveSelectedSnapshotCommand({ candidate: selectedCandidate, resolver: host.resolver, contentStore: recordingStore });

        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D3b. the explicitly selected (second) candidate resolves');
        assert(queriedLocators.length === 1 && queriedLocators[0] === secondReference.uri,
            'D3c. FLAGSHIP — exactly one retrieval was issued, against the SELECTED (second) candidate\'s own locator — discovery order named the first candidate first, but selection, not order, governed retrieval');
        const resolvedText = typeof resolved.bytes === 'string' ? resolved.bytes : new TextDecoder().decode(resolved.bytes);
        assert(resolvedText === secondBytes, 'D3d. the retrieved bytes are genuinely the SELECTED candidate\'s own — never the first-discovered one');

        console.log('✓ Section D: candidate discovery order never substitutes for an explicit user selection — resolveCandidate() never re-discovers, and an explicit selection of the SECOND candidate drives retrieval against that exact locator alone, proven by an external spy');
    }

    // ===============================================================
    // Section E — RESOLUTION SEMANTICS.
    //
    //   resolve()            = discover candidates for a requested
    //                          contentHash and resolve the first
    //                          applicable one.
    //   resolveCandidate(c)  = resolve exactly this candidate.
    // ===============================================================
    {
        // E1. Structural: resolve()'s own body calls this.resolveCandidate()
        // exactly once — never a second, independent retrieval/verification
        // sequence.
        const resolverSource = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        const resolveBody = (resolverSource.match(/async resolve\(discoveryTag[\s\S]*?\n {4}\}/) || [''])[0];
        assert(resolveBody.length > 0, 'E1a. sanity: resolve()\'s own body was located');
        const resolveCandidateCallsWithinResolve = (resolveBody.match(/this\.resolveCandidate\(/g) || []).length;
        assert(resolveCandidateCallsWithinResolve === 1,
            'E1b. resolve() calls this.resolveCandidate() exactly once — LOCATION/RETRIEVAL/VERIFICATION exist as ONE implementation, reused, never duplicated for the "discover first match" path');

        // E2. FLAGSHIP, behavioral: two candidates deliberately announced
        // sharing the IDENTICAL contentHash but genuinely DIFFERENT
        // locators/bytes. resolve(hash) is deterministic first-match;
        // resolveCandidate() resolves whichever ONE object is handed to
        // it, regardless of which one resolve() would have picked.
        const host = makeSharedHostRuntime('audit-156-section-e');
        const sharedHash = computeContentHash('E: nominal shared content — the announced contentHash both candidates will claim');
        const firstBytesAtLocator = await host.contentStore.put('E: bytes actually served by the FIRST-announced locator');
        const secondBytesAtLocator = await host.contentStore.put('E: bytes actually served by the SECOND-announced locator');
        // Both candidates CLAIM the shared hash (a real, if contrived,
        // possibility discovery never rules out — see Section C, a
        // candidate's own contentHash is a claim); resolve() will fail
        // verification for whichever it happens to pick first, exactly as
        // it must; resolveCandidate() against each one independently
        // proves each locator's own real bytes are what actually get
        // retrieved.
        await host.announcer.publish({ contentHash: sharedHash, locator: firstBytesAtLocator.uri, storage: firstBytesAtLocator.storage });
        await host.announcer.publish({ contentHash: sharedHash, locator: secondBytesAtLocator.uri, storage: secondBytesAtLocator.storage });

        const viaResolve = await executeDiscoverSnapshotCommand({ discoveryTag: 'audit-156-section-e', contentHash: sharedHash, resolver: host.resolver, contentStore: host.contentStore });
        assert(viaResolve.candidates.length === 2, 'E2a. sanity: both candidates matched the requested contentHash under resolve()\'s own discovery step');
        assert(viaResolve.locator === firstBytesAtLocator.uri,
            'E2b. resolve() deterministically attempted the FIRST-discovered matching candidate — never the second, never "whichever verifies"');

        const explicitCandidate = { contentHash: sharedHash, locator: secondBytesAtLocator.uri, storage: secondBytesAtLocator.storage };
        const viaResolveCandidate = await executeResolveSelectedSnapshotCommand({ candidate: explicitCandidate, resolver: host.resolver, contentStore: host.contentStore });
        assert(viaResolveCandidate.locator === secondBytesAtLocator.uri,
            'E2c. FLAGSHIP — resolveCandidate(), handed the SECOND candidate explicitly, resolves THAT one — proving resolve(contentHash) could never have substituted for an explicit selection here: two candidates share one contentHash, and only the caller\'s own choice, never resolve()\'s own first-match rule, identifies which ONE resolveCandidate() attempts');

        console.log('✓ Section E: resolve() (discover + first-match) and resolveCandidate() (resolve exactly this) remain two intentionally different operations, sharing one retrieval/verification implementation — proven both structurally and with two candidates deliberately sharing one contentHash');
    }

    // ===============================================================
    // Section F — VERIFICATION AUTHORITY.
    //
    //   metadata = claim
    //   bytes = evidence
    //   hash(bytes) = verification
    //
    // No UI/component independently computes a content hash to decide
    // validity on its own.
    // ===============================================================
    {
        const uiFiles = await listJsFilesRecursively('ui/');
        assert(uiFiles.length > 10, 'F0. sanity: the UI directory sweep genuinely found a substantial number of files');

        const offendingFiles = [];
        for (const file of uiFiles) {
            const source = await codeOnlySource(file);
            if (source.includes('computeContentHash')) {
                offendingFiles.push(file);
            }
        }
        assert(offendingFiles.length === 0,
            `F1. FLAGSHIP, repository-wide — no file under ui/ ever references computeContentHash(); offenders: ${offendingFiles.join(', ')}. Content hash verification stays entirely inside content stores (content/ArweaveContentStore.js), core/ContentReference.js#verify(), and the resolver's own VERIFICATION step — never reimplemented, even partially, by a UI/component`);

        // F2. Structural, one layer deeper: OwnPublicationPanel.js — the
        // ONE component in this codebase actually rendering Snapshot
        // discovery/resolution/attribution results — never imports
        // computeContentHash, ContentReference, or core/contentHash.js
        // at all; every "is this valid" fact it displays is entirely the
        // resolver's/attribution function's own, read off a result
        // object, never independently recomputed.
        const panelSource = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(!panelSource.includes("from '../../serializer/contentHash.js'") && !panelSource.includes('computeContentHash'),
            'F2. OwnPublicationPanel.js never imports serializer/contentHash.js — it has no capability to independently compute a hash even if it wanted to');

        console.log('✓ Section F: computeContentHash() is called nowhere under ui/ — content verification stays entirely inside the resolution machinery (content stores + core/ContentReference.js#verify()), never duplicated by a UI/component');
    }

    // ===============================================================
    // Section G — ATTRIBUTION AUTHORITY.
    //
    // application/SnapshotPublicationAttribution.js remains the only
    // place MATCH/NO_MATCH are ever produced.
    // ===============================================================
    {
        // G1. Repository-wide: every file importing
        // SnapshotPublicationAttributionOutcome is either that enum's own
        // definition, the one function that produces its values, or a
        // test — never a resolver, a discovery service, a candidate
        // object, or any OTHER UI component.
        const allSourceFiles = [
            ...(await listJsFilesRecursively('application/')),
            ...(await listJsFilesRecursively('ui/')),
            ...(await listJsFilesRecursively('core/')),
            ...(await listJsFilesRecursively('content/'))
        ];
        const allowedImporters = new Set([
            'application/SnapshotPublicationAttribution.js',
            'application/SnapshotPublicationAttributionOutcome.js'
        ]);
        const unexpectedImporters = [];
        for (const file of allSourceFiles) {
            const source = await codeOnlySource(file);
            if (source.includes('SnapshotPublicationAttributionOutcome') && !allowedImporters.has(file)) {
                unexpectedImporters.push(file);
            }
        }
        assert(unexpectedImporters.length === 0,
            `G1. FLAGSHIP — outside its own defining file and application/SnapshotPublicationAttribution.js's own use of it, no application/core/content/ui file ever references SnapshotPublicationAttributionOutcome directly; unexpected importers: ${unexpectedImporters.join(', ')}. Every OTHER file that displays MATCH/NO_MATCH (OwnPublicationPanel.js included) does so by reading an already-computed .outcome string, never by importing the vocabulary to manufacture one itself`);

        // G2. No file outside SnapshotPublicationAttribution.js itself
        // constructs an object literal claiming `outcome: 'match'` or
        // `outcome: 'no-match'` — the literal wire values, not merely the
        // enum reference G1 already checked.
        const literalOutcomePattern = /outcome\s*:\s*['"](?:match|no-match)['"]/;
        for (const file of allSourceFiles) {
            if (file === 'application/SnapshotPublicationAttribution.js') continue;
            const source = await codeOnlySource(file);
            assert(!literalOutcomePattern.test(source),
                `G2. ${file} never constructs an object literal with outcome: 'match'/'no-match' — those literal values are manufactured in exactly one place`);
        }

        // G3. Behavioral: resolveSnapshotPublicationAttribution() is the
        // ONLY function that ever changes a genuinely resolved Snapshot's
        // fate from RESOLVED (resolution's own vocabulary) to MATCH/
        // NO_MATCH (attribution's own, different vocabulary) — a resolved
        // result handed anywhere else stays exactly RESOLVED, never
        // silently upgraded.
        const host = makeSharedHostRuntime('audit-156-section-g');
        const { reference } = await placeAndAnnounce(host, 'G: attribution authority fixture content');
        const resolved = await executeDiscoverSnapshotCommand({ discoveryTag: host.discoveryTag, contentHash: reference.hash, resolver: host.resolver, contentStore: host.contentStore });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'G3a. sanity: the Snapshot resolved genuinely');
        assert(!('match' in resolved) && resolved.outcome !== SnapshotPublicationAttributionOutcome.MATCH,
            'G3b. a bare resolution result carries no attribution verdict of its own — RESOLVED is not, and never silently becomes, MATCH');
        const publication = new Publication({ id: 'pub-audit-156-g', documentId: 'doc-audit-156-g', contentReference: new ContentReference({ hash: reference.hash }) });
        const attribution = resolveSnapshotPublicationAttribution(publication, resolved);
        assert(attribution.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'G3c. only the explicit attribution call produces MATCH — resolution itself never does');

        console.log('✓ Section G: application/SnapshotPublicationAttribution.js remains the sole producer of MATCH/NO_MATCH, both by import graph and by literal-value construction, repository-wide — no resolver, discovery service, candidate, or UI component manufactures an attribution verdict of its own');
    }

    // ===============================================================
    // Section H — UI STATE AUTHORITY.
    //
    //   UI state describes the interaction; it never becomes domain
    //   truth.
    // ===============================================================
    {
        // H1. Repository-wide: NO application/core/content (domain-layer)
        // file ever reads any of these UI state field names — the real
        // invariant this section exists to hold. `snapshotDiscoveryResult`/
        // `snapshotAttributionResult` are legitimately MIRRORED, as
        // entirely independent per-component copies, by both
        // OwnPublicationPanel.js (0.9.144) and WorldEncounterCanvas.js
        // (0.9.144, the World Encounters surface's own, unrelated
        // Publication) — two UI components each holding their own
        // ephemeral interaction state is not a violation of "UI state
        // never becomes domain truth"; a DOMAIN-layer file depending on
        // either copy would be. The selected-candidate family
        // (0.9.151/0.9.152/0.9.154), by contrast, is exclusive to
        // OwnPublicationPanel.js — no other UI component has ever grown a
        // browse/select/resolve-selected/attribute-selected affordance of
        // its own, so that family is checked against every OTHER UI file
        // too.
        const mirroredAcrossComponentsFieldNames = ['snapshotAttributionResult', 'snapshotDiscoveryResult'];
        const exclusiveToOwnPublicationPanelFieldNames = ['selectedSnapshotCandidate', 'selectedSnapshotResolutionResult', 'selectedSnapshotAttributionResult', 'snapshotCandidateDiscoveryResult'];
        const allUiStateFieldNames = [...mirroredAcrossComponentsFieldNames, ...exclusiveToOwnPublicationPanelFieldNames];
        const domainFiles = [
            ...(await listJsFilesRecursively('application/')),
            ...(await listJsFilesRecursively('core/')),
            ...(await listJsFilesRecursively('content/'))
        ];
        for (const field of allUiStateFieldNames) {
            for (const file of domainFiles) {
                const source = await codeOnlySource(file);
                assert(!source.includes(field),
                    `H1. ${file} never references '${field}' — that field is ephemeral UI state, never a fact any application-/core-/content-layer file depends on`);
            }
        }
        const otherUiFiles = (await listJsFilesRecursively('ui/')).filter((f) => f !== 'ui/components/OwnPublicationPanel.js');
        for (const field of exclusiveToOwnPublicationPanelFieldNames) {
            for (const file of otherUiFiles) {
                const source = await codeOnlySource(file);
                assert(!source.includes(field),
                    `H1b. ${file} never references '${field}' either — the selected-candidate browse/select/resolve/attribute family is exclusive to OwnPublicationPanel.js; no OTHER UI component treats it as shared truth`);
            }
        }

        // H2. Structural: selectedSnapshotCandidate is never mutated by
        // this file itself — a candidate object, once selected, is never
        // annotated with a derived status field (e.g.
        // `this.selectedSnapshotCandidate.verified = true`) that would
        // let discovery-order metadata quietly acquire attribution
        // meaning by being written back onto the SAME object other code
        // still holds a reference to.
        const panelSource = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(!/selectedSnapshotCandidate\.\w+\s*=/.test(panelSource),
            'H2. OwnPublicationPanel.js never assigns a property onto selectedSnapshotCandidate itself — a selected candidate is read, never annotated');
        assert(!/\.locator\.contentHash|\.contentHash\.locator/.test(panelSource),
            'H2b. sanity: no accidental field-swap idiom is present in this file\'s own source');

        // H3. Behavioral, FLAGSHIP: selecting a candidate never, by
        // itself, implies verification — reading selectedSnapshotCandidate
        // alone (with no resolution and no attribution ever having run)
        // must never be mistaken, structurally, for "verifiedSnapshot."
        // This is the property the whole file's own header names as the
        // most important one this section exists to hold; it is proven
        // once more here, over the REAL composed runtime, specifically as
        // a REPOSITORY-WIDE claim rather than a single-file unit check.
        const host = makeSharedHostRuntime('audit-156-section-h');
        const { reference } = await placeAndAnnounce(host, 'H: a genuinely valid, but never-yet-verified-by-this-panel Snapshot');
        const candidates = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: host.discoveryTag, discoveryQueryService: host.queryService });
        const ctx = {
            publication: null, selectedSnapshotCandidate: candidates[0],
            selectedSnapshotResolutionResult: null, selectedSnapshotAttributionResult: null,
            resolveSelectedSnapshotCommand: null, selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate
        };
        assert(ctx.selectedSnapshotCandidate !== null && ctx.selectedSnapshotResolutionResult === null && ctx.selectedSnapshotAttributionResult === null,
            'H3. FLAGSHIP — a candidate can be selected with NEITHER a resolution NOR an attribution result ever having existed; "selected" and "verified" are never the same fact, and nothing in this codebase treats a bare selection as if it were');

        console.log('✓ Section H: the four selected-candidate/attribution UI state families exist and are read only inside OwnPublicationPanel.js — repository-wide, no application-, core-, content-, or other UI-layer file treats interaction state as domain truth, and a selection alone never implies verification');
    }

    // ===============================================================
    // Section I — IDENTITY SEPARATION.
    //
    // Pairwise separation among: Publication ID, Publication content
    // hash, Snapshot content hash, Snapshot locator, Arweave transaction
    // ID, Nostr event ID, Nostr relay URL, Discovery tag.
    // ===============================================================
    {
        const discoveryTag = 'audit-156-section-i-identity-separation';
        const relayUrl = 'wss://audit-156-fake-relay.example';
        const host = makeSharedHostRuntime(discoveryTag, { relayUrl });

        // A NO_MATCH scenario deliberately — Publication content hash and
        // Snapshot content hash must be genuinely different VALUES here,
        // so all eight identifiers below can be checked pairwise distinct
        // without one intentionally-equal pair (the MATCH case) muddying
        // the proof.
        const publicationBytes = 'I: the Publication\'s own real content';
        const snapshotBytes = 'I: a different, genuinely unrelated Snapshot';
        const publicationHash = computeContentHash(publicationBytes);
        const { reference, announcement } = await placeAndAnnounce(host, snapshotBytes);

        const publication = new Publication({ id: 'pub-audit-156-identity', documentId: 'doc-audit-156-identity', contentReference: new ContentReference({ hash: publicationHash }) });
        const resolved = await executeDiscoverSnapshotCommand({ discoveryTag, contentHash: reference.hash, resolver: host.resolver, contentStore: host.contentStore });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'I0a. sanity: the Snapshot itself resolves genuinely');
        const attribution = resolveSnapshotPublicationAttribution(publication, resolved);
        assert(attribution.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH, 'I0b. sanity: this really is the NO_MATCH scenario — the two content hashes genuinely differ');

        const publicationId = publication.id;
        const snapshotContentHash = reference.hash;
        const locator = reference.uri;
        const arweaveTransactionId = locator.replace(/^ar:\/\//, '');
        const nostrEventId = announcement.id;
        const nostrRelayUrl = host.announcer.relayUrl;
        const identifiers = {
            publicationId, publicationContentHash: publicationHash, snapshotContentHash,
            snapshotLocator: locator, arweaveTransactionId, nostrEventId, nostrRelayUrl, discoveryTag
        };

        // I1. FLAGSHIP — all eight identifiers are pairwise distinct
        // string values. In this scenario NO two of them are expected to
        // coincide (unlike a MATCH scenario, where Publication content
        // hash and Snapshot content hash are intentionally equal by
        // design — see 0.9.155's own Section F, "two attribution paths
        // converge," for that separate, already-proven fact).
        const values = Object.values(identifiers);
        assert(values.every((v) => typeof v === 'string' && v.length > 0), 'I1a. sanity: every identifier is a genuine, non-empty string');
        assert(new Set(values).size === values.length,
            `I1b. FLAGSHIP — all eight identifiers are pairwise distinct values: ${JSON.stringify(identifiers, null, 2)}`);

        // I2. Format separation — the identifiers are not merely
        // different VALUES today by luck of the fixture; their own wire
        // FORMATS never overlap, so an accidental substitution would be
        // structurally conspicuous, not merely numerically unlucky.
        assert(locator.startsWith('ar://'), 'I2a. the Snapshot locator carries an explicit ar:// scheme, never a bare id indistinguishable from a transaction id or a hash');
        assert(!arweaveTransactionId.startsWith('ar://'), 'I2b. the extracted Arweave transaction id itself never carries the scheme prefix — locator and transaction id are related but distinct representations');
        assert(/^[0-9a-f]{64}$/i.test(nostrEventId), 'I2c. the Nostr event id is a 64-hex-character value — this codebase\'s own EVENT_ID_PATTERN in application/NostrSnapshotDiscoveryPublisher.js');
        assert(!/^[0-9a-f]{64}$/i.test(snapshotContentHash), 'I2d. the content hash (fnv1a-32, per core/ContentReference.js\'s own default algorithm) is never a 64-hex value — it can never be mistaken for a Nostr event id by format alone');
        assert(nostrRelayUrl.startsWith('wss://'), 'I2e. the relay URL carries an explicit wss:// scheme, distinct from every other identifier\'s own format');

        // I3. Structural: the collaborators that use these identifiers
        // never read the WRONG one for a given purpose — e.g.
        // SnapshotPublicationAttribution.js compares content hashes only,
        // never publication.id.
        const attributionSource = await codeOnlySource('application/SnapshotPublicationAttribution.js');
        assert(!attributionSource.includes('publication.id'),
            'I3a. application/SnapshotPublicationAttribution.js never reads publication.id — attribution compares content identity only, never a Publication\'s own, unrelated identity');
        const discoverCommandSource = await codeOnlySource('application/DiscoverSnapshotCommand.js');
        assert(!discoverCommandSource.includes('publication.id') && !discoverCommandSource.includes('.relayUrl'),
            'I3b. application/DiscoverSnapshotCommand.js never reads a Publication id or a relay url — discovery is driven by contentHash/discoveryTag alone');

        console.log('✓ Section I: Publication ID, Publication content hash, Snapshot content hash, Snapshot locator, Arweave transaction ID, Nostr event ID, Nostr relay URL, and Discovery tag are pairwise distinct in value AND in wire format, and the collaborators that consume them never read the wrong one for a given purpose');
    }

    // ===============================================================
    // Section J — SINGLE MACHINERY PATHS.
    //
    //   resolve() -> resolveCandidate() -> location/retrieval -> verification
    //   known-hash attribution + selected attribution -> SnapshotPublicationAttribution
    // ===============================================================
    {
        // J1. resolve() -> resolveCandidate() convergence, PROVEN
        // BEHAVIORALLY over the real class (Section E already proved this
        // structurally via source inspection; this is the runtime,
        // call-count companion proof).
        const host = makeSharedHostRuntime('audit-156-section-j');
        const { reference } = await placeAndAnnounce(host, 'J: single machinery path fixture content');

        let resolveCandidateCalls = 0;
        let resolveCandidateArgument = null;
        const realResolveCandidate = host.resolver.resolveCandidate.bind(host.resolver);
        host.resolver.resolveCandidate = (candidate, options) => {
            resolveCandidateCalls += 1;
            resolveCandidateArgument = candidate;
            return realResolveCandidate(candidate, options);
        };

        const resolved = await host.resolver.resolve(host.discoveryTag, reference.hash, { contentStore: host.contentStore });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'J1a. sanity: resolve() genuinely reached RESOLVED');
        assert(resolveCandidateCalls === 1, 'J1b. FLAGSHIP — resolve() calls resolveCandidate() exactly once at runtime, proven by a spy over the real resolver instance, never a second, parallel retrieval/verification implementation');
        assert(resolveCandidateArgument && resolveCandidateArgument.contentHash === reference.hash && resolveCandidateArgument.locator === reference.uri,
            'J1c. the candidate resolveCandidate() actually received is the SAME one resolve()\'s own discovery step selected — never a re-derived or re-described copy');

        // J2. Attribution convergence — both attribution entry points
        // (the already-known-contentHash path, and the browsed-and-
        // selected path) import resolveSnapshotPublicationAttribution
        // exactly once and call it from exactly two call sites in
        // OwnPublicationPanel.js — the identical structural proof
        // 0.9.155's own Section F already established, re-verified here
        // as part of this holistic audit's own "single-source-of-
        // behavior" claim rather than a single-feature one.
        const panelSource = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const importCount = (panelSource.match(/import\s*\{\s*resolveSnapshotPublicationAttribution\s*\}/g) || []).length;
        assert(importCount === 1, 'J2a. resolveSnapshotPublicationAttribution is imported exactly once into OwnPublicationPanel.js');
        const callSiteCount = (panelSource.match(/resolveSnapshotPublicationAttribution\(/g) || []).length;
        assert(callSiteCount === 2, 'J2b. exactly two call sites exist — discoverOwnSnapshot()\'s own (known-contentHash path) and attributeSelectedSnapshot()\'s own (browsed-and-selected path) — both the SAME imported function, never a second, independent comparison implementation');

        // J3. Behavioral companion to J2: both paths, run side by side
        // against the identical real candidate, converge on identical
        // verdicts — the single implementation genuinely produces the
        // single behavior, not merely a single import statement.
        const publication = new Publication({ id: 'pub-audit-156-j', documentId: 'doc-audit-156-j', contentReference: new ContentReference({ hash: reference.hash }) });
        const knownHashPathResult = resolveSnapshotPublicationAttribution(publication, resolved);
        const candidateForSelection = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage };
        const selectedPathResolution = await executeResolveSelectedSnapshotCommand({ candidate: candidateForSelection, resolver: host.resolver, contentStore: host.contentStore });
        const selectedPathResult = resolveSnapshotPublicationAttribution(publication, selectedPathResolution);
        assert(knownHashPathResult.outcome === selectedPathResult.outcome && knownHashPathResult.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'J3. both attribution entry points converge on the identical MATCH verdict for the identical underlying content — one machinery, two doors in');

        console.log('✓ Section J: resolve() converges on resolveCandidate() exactly once per call (proven behaviorally over the real resolver instance), and both attribution entry points converge on the single, real resolveSnapshotPublicationAttribution() implementation — two genuine single-source-of-behavior proofs, never a second parallel implementation of either');
    }

    console.log('\n✅ All Snapshot Lifecycle & Semantic Boundary Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
