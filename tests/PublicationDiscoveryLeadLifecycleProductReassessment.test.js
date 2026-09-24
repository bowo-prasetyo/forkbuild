import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { SnapshotPlacementStoreRegistry } from '../application/snapshot/placement/SnapshotPlacementStoreRegistry.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/snapshot/placement/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalSnapshotCandidateDiscoveryQueryService } from '../application/snapshot/LocalSnapshotCandidateDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/snapshot/WorldSnapshotDiscoveryMonitor.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { resolveDecentralizedWorldEncounterLead } from '../application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js';
import { SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../application/snapshot/SnapshotOutcomeInspectionView.js';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { Publication } from '../publisher/Publication.js';
import { ownPublicationPanelFiles } from './support/SourceFileGroups.js';

// 0.9.538 — Publication Discovery Lead Lifecycle Product Reassessment.
//
// 0.9.532 through 0.9.537 audited what happens AFTER a Publication is
// selected — World session continuity, action-state boundaries, async
// result ownership. This milestone turns to the seam directly upstream:
// does a Wanderer get an honest, stable experience while moving from an
// unverified discovery lead toward a selected and verified Publication,
// across a codebase that now discovers candidates from four independent
// origins (Local, Peer, Nostr, Arweave)?
//
// This is a REASSESSMENT, not a first pass. Reading the production code
// this milestone's own brief names turned up an unusually deep, already-
// built answer, spread across roughly thirty prior milestones
// (0.9.24-0.9.29 for the search-index "lead" vocabulary; 0.9.133-0.9.171
// for the Snapshot discovery envelope; 0.9.150-0.9.158 for the candidate
// browse/select/resolve/attribute pipeline; 0.9.485-0.9.500 for Local/
// Nostr/Arweave composition; 0.9.528 for user-facing vocabulary). Rather
// than re-litigate what each of those already proved in isolation, this
// file's own ten lettered sections (A-J, matching the requesting brief's
// own lettering) each do ONE of two things: (1) a genuinely NEW live
// reproduction of an angle no prior single-purpose milestone combined
// this way, or (2) a fresh, live reconfirmation — against the CURRENT
// production code, never a re-read of a prior milestone's own test file
// — that an already-established invariant still holds. Every citation
// below names the milestone that already proved the underlying fact, so
// this file's own contribution is legible as reassessment, not discovery.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A real Arweave-shaped CONTENT gateway (put()/get() bytes) — separate
// from the DISCOVERY gateway below, exactly as content/
// ArweaveContentStore.js and application/arweave/ArweaveSnapshotDiscoveryQueryService.js
// remain two independent substrates in production.
function makeFakeArweaveContentGateway() {
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
    return { fetchImpl };
}

function makeFakeArweaveSigner(prefix) {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        const id = `${prefix}-content-tx-${counter}`;
        return { id, transaction: { id, data: material } };
    }
    return { sign };
}

// A real Arweave-shaped DISCOVERY gateway (GraphQL tag search + raw
// transaction fetch) — mirrors tests/
// SnapshotCandidateDiscoveryArweaveCompositionIntegrationAudit.test.js's
// own makeFakeArweaveGateway (0.9.500), rebuilt fresh here rather than
// imported, since that file's helper is not itself a shared production
// module.
function makeFakeArweaveDiscoveryGateway({ transactionIds = [], envelopes = {} } = {}) {
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if ((options.method || 'GET') === 'POST') {
            return { ok: true, json: async () => ({ data: { transactions: { edges: transactionIds.map((id) => ({ node: { id } })) } } }) };
        }
        const id = parsed.pathname.slice(1);
        if (Object.prototype.hasOwnProperty.call(envelopes, id)) {
            return { ok: true, headers: { get: () => null }, text: async () => envelopes[id] };
        }
        return { ok: false, headers: { get: () => null }, text: async () => 'not found' };
    }
    return { fetchImpl };
}

// `publicationId` and `claimedPosition` travel together, or not at all —
// core/SnapshotDiscoveryEnvelope.js's own 0.9.171 "both-or-neither" rule.
// A caller here supplying `publicationId` gets a harmless placeholder
// `claimedPosition` for free, so this test file's own fixtures never need
// to care about that rule to exercise the fields that DO matter to it.
function positionClaimFor(publicationId) {
    return publicationId ? { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } } : {};
}

function arweaveEnvelopeJson({ contentHash, locator, storage, publicationId }) {
    return JSON.stringify({
        protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
        version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
        contentHash, locator, storage,
        ...positionClaimFor(publicationId)
    });
}

function makeNostrEnvelopeEvent({ contentHash, locator, storage, publicationId }) {
    return {
        content: JSON.stringify({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash, locator, storage,
            ...positionClaimFor(publicationId)
        })
    };
}

function makeNostrQueryImpl(events) {
    return async () => events;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        discoverSnapshotCommand: null,
        discoverSnapshotCandidatesCommand: null,
        resolveSelectedSnapshotCommand: null,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotDiscoveryRequestId: 0,
        snapshotAttributionResult: null,
        snapshotCandidateDiscoveryExecuting: false,
        snapshotCandidateDiscoveryError: null,
        snapshotCandidateDiscoveryResult: null,
        snapshotCandidateDiscoveryRequestId: 0,
        selectedSnapshotCandidate: null,
        selectedSnapshotResolutionExecuting: false,
        selectedSnapshotResolutionError: null,
        selectedSnapshotResolutionResult: null,
        selectedSnapshotResolutionRequestId: 0,
        selectedSnapshotAttributionResult: null,
        discoverOwnSnapshot: OwnPublicationPanel.methods.discoverOwnSnapshot,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        attributeSelectedSnapshot: OwnPublicationPanel.methods.attributeSelectedSnapshot,
        ...overrides
    };
}

// Builds one shared "world": a real content-hash-verifying Arweave
// content store (for RETRIEVAL/VERIFICATION), plus real Local/Nostr/
// Arweave DISCOVERY sources feeding SnapshotCandidateDiscoveryQueryService.
// Every candidate produced by this world is a genuine, hash-derivable
// claim — never a hand-authored fixture pretending to be one.
function makeWorld(prefix) {
    const contentGateway = makeFakeArweaveContentGateway();
    const signer = makeFakeArweaveSigner(prefix);
    const contentStore = new ArweaveContentStore({ signer, fetchImpl: contentGateway.fetchImpl });
    const registry = new SnapshotPlacementStoreRegistry();
    registry.register(contentStore);

    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const localSource = new LocalSnapshotCandidateDiscoveryQueryService(placementCatalog);

    const nostrEvents = [];
    const nostrSource = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(nostrEvents) });

    const arweaveDiscoveryTransactions = [];
    const arweaveDiscoveryEnvelopes = {};
    const arweaveSource = new ArweaveSnapshotDiscoveryQueryService({
        fetchImpl: (...args) => makeFakeArweaveDiscoveryGateway({
            transactionIds: arweaveDiscoveryTransactions,
            envelopes: arweaveDiscoveryEnvelopes
        }).fetchImpl(...args)
    });

    const resolver = new DecentralizedSnapshotResolver(nostrSource);

    return {
        contentStore, registry, placementCatalog, localSource,
        nostrEvents, arweaveDiscoveryTransactions, arweaveDiscoveryEnvelopes,
        nostrSource, arweaveSource, resolver
    };
}

// Places real bytes on the shared Arweave content store and returns the
// resulting ContentReference — the same "genuine bytes, genuine hash"
// discipline every prior milestone in this family already holds.
async function place(world, bytes) {
    return world.contentStore.put(bytes);
}

function addLocalPlacement(world, { publicationId, reference, id }) {
    const placement = new PublicationSnapshotPlacement({
        id, publicationId, contentHash: reference.hash, storage: reference.storage, locator: reference.uri
    });
    world.placementCatalog.add(placement);
    return placement;
}

function addNostrAnnouncement(world, { publicationId, reference }) {
    world.nostrEvents.push(makeNostrEnvelopeEvent({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId }));
}

let arweaveTxCounter = 0;
function addArweaveAnnouncement(world, { publicationId, reference }) {
    arweaveTxCounter += 1;
    const txId = `discovery-tx-${arweaveTxCounter}`;
    world.arweaveDiscoveryTransactions.push(txId);
    world.arweaveDiscoveryEnvelopes[txId] = arweaveEnvelopeJson({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId });
}

async function run() {
    console.log('=== 0.9.538 — Publication Discovery Lead Lifecycle Product Reassessment ===\n');

    // ===============================================================
    // SECTION A — Lead identity: five concepts, never collapsed.
    // ===============================================================
    {
        // A1. core/DecentralizedWorldDiscoveryLead.js (0.9.24) — the
        // search-index "lead" vocabulary — treats origin/discoveryTag/uri
        // as three independent, both-required facts. Two leads sharing a
        // uri but reported by different services remain two distinct,
        // never-merged descriptions; the module exports no combining
        // function at all.
        const leadFromServiceOne = describeDecentralizedWorldDiscoveryLead({ origin: 'index-service-1', discoveryTag: 'forkbuild', uri: 'https://mirror.example/x' });
        const leadFromServiceTwo = describeDecentralizedWorldDiscoveryLead({ origin: 'index-service-2', discoveryTag: 'forkbuild', uri: 'https://mirror.example/x' });
        assert(leadFromServiceOne !== null && leadFromServiceTwo !== null, 'A1a. both leads describe successfully');
        assert(leadFromServiceOne.uri === leadFromServiceTwo.uri, 'A1b. they genuinely share a uri');
        assert(leadFromServiceOne.origin !== leadFromServiceTwo.origin, 'A1c. ...but never share an origin — provenance stays at the reporting service, never folded into the uri');
        assert(leadFromServiceOne !== leadFromServiceTwo, 'A1d. two distinct, independently-frozen lead objects — never one shared/merged instance');
        const leadModuleSource = await codeOnlySource('core/DecentralizedWorldDiscoveryLead.js');
        assert(!/combine|dedupe|deduplicate|rank/i.test(leadModuleSource), 'A1e. the lead-description module itself contains no combining/deduplication/ranking vocabulary — see its own header, "one lead per call"');

        // A2. A DIFFERENT identity vocabulary — the walking-triggered
        // Snapshot candidate family (0.9.133-0.9.500) — never imports, and
        // is never imported by, the search-index lead family (0.9.24-29).
        // Two independently-evolved discovery-lead concepts, confirmed
        // structurally distinct, not merely distinct by naming
        // convention.
        const candidateFamilyFiles = [
            'application/snapshot/SnapshotCandidateDiscoveryQueryService.js',
            'application/snapshot/LocalSnapshotCandidateDiscoveryQueryService.js',
            'application/nostr/NostrSnapshotDiscoveryQueryService.js',
            'application/arweave/ArweaveSnapshotDiscoveryQueryService.js',
            'application/snapshot/DecentralizedSnapshotResolver.js'
        ];
        // Checked against CODE only (comments may legitimately discuss the
        // relationship between the two vocabularies, as
        // NostrSnapshotDiscoveryQueryService.js's own "deliberately
        // excluded" section does) — an actual `import` naming the other
        // vocabulary's module is what would matter here.
        for (const file of candidateFamilyFiles) {
            const code = await codeOnlySource(file);
            assert(!/import[^;]*DecentralizedWorldDiscoveryLead/.test(code), `A2. ${file} never IMPORTS the search-index lead vocabulary (may still mention it in a comment)`);
        }
        const leadModuleAndSiblings = ['core/DecentralizedWorldDiscoveryLead.js', 'application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js', 'application/worldEncounter/DecentralizedWorldEncounterLeadSelection.js'];
        for (const file of leadModuleAndSiblings) {
            const code = await codeOnlySource(file);
            assert(!/import[^;]*(SnapshotCandidateDiscoveryQueryService|DecentralizedSnapshotResolver)/.test(code), `A2b. ${file} never IMPORTS the walking-triggered Snapshot candidate vocabulary`);
        }

        // A3. Within the Snapshot candidate vocabulary itself: contentHash,
        // locator, and storage remain three separate fields on every
        // candidate a real source produces — never collapsed into one
        // "identity" string. Reproduced live off a real placement.
        const world = makeWorld('a3');
        const reference = await place(world, 'Section A: identity fields stay separate');
        addLocalPlacement(world, { publicationId: 'pub-a3', reference });
        const [candidate] = await world.localSource.search('tag-a3');
        assert(candidate.contentHash === reference.hash, 'A3a. contentHash is its own field');
        assert(candidate.locator === reference.uri, 'A3b. locator is its own, independent field');
        assert(candidate.storage === reference.storage, 'A3c. storage is its own, independent field');
        assert(candidate.publicationId === 'pub-a3', 'A3d. publicationId rides along as a fourth, independent field — never folded into any of the other three');

        // A4. Arweave's own announcement transaction id — the "discovery
        // artifact" the requesting brief names — never rides along on a
        // reported candidate, and never substitutes for the candidate's
        // own locator (0.9.499's own "three distinct identities, never
        // collapsed" header invariant, reconfirmed live here).
        const arweaveWorld = makeWorld('a4');
        const arweaveReference = await place(arweaveWorld, 'Section A: an Arweave-discovered candidate');
        addArweaveAnnouncement(arweaveWorld, { reference: arweaveReference });
        const [arweaveCandidate] = await arweaveWorld.arweaveSource.search('tag-a4');
        assert(arweaveCandidate.locator === arweaveReference.uri, 'A4a. the reported locator is the CONTENT transaction, never the announcement transaction');
        assert(!('announcementId' in arweaveCandidate), 'A4b. no announcementId key rides along on the reported candidate at all');
        assert(!Object.values(arweaveCandidate).includes(`discovery-tx-${arweaveTxCounter}`), 'A4c. the announcement transaction id this file\'s own GraphQL step discovered does not leak into any field of the reported candidate');

        // A5. Discovery origin (which service/substrate reported a lead)
        // is never treated as strong enough, by itself, to merge two
        // otherwise-independent leads sharing a uri — reconfirmed one
        // layer up, at the encounter-lead resolution boundary (0.9.28):
        // two associations naming the SAME uri under two DIFFERENT
        // origins resolve to TWO distinct leads (AMBIGUOUS), never one.
        const requestedMaterial = { kind: 'PUBLICATION', objectId: 'obj-a5' };
        const leads = [
            { origin: 'service-one', discoveryTag: 'tag', uri: 'ipfs://shared-cid' },
            { origin: 'service-two', discoveryTag: 'tag', uri: 'ipfs://shared-cid' }
        ];
        const associations = [
            { kind: 'PUBLICATION', objectId: 'obj-a5', origin: 'service-one', discoveryTag: 'tag', uri: 'ipfs://shared-cid' },
            { kind: 'PUBLICATION', objectId: 'obj-a5', origin: 'service-two', discoveryTag: 'tag', uri: 'ipfs://shared-cid' }
        ];
        const leadResolution = resolveDecentralizedWorldEncounterLead({ requestedMaterial, leads, associations });
        assert(leadResolution.status === 'AMBIGUOUS', 'A5. two leads sharing a uri under different origins are never silently merged into one RESOLVED lead — a shared uri is not evidence of corroboration');
        assert(leadResolution.candidates.length === 2, 'A5b. both are reported as genuinely distinct candidates');
    }
    console.log('✓ Section A: five identity concepts (Publication identity, content identity, locator, discovery artifact/announcement id, and discovery origin) each stay independently tracked across both discovery-lead vocabularies this codebase maintains — reconfirms 0.9.24, 0.9.28, and 0.9.499 live, plus one new structural cross-import check neither prior milestone ran.');

    // ===============================================================
    // SECTION B — Candidate multiplicity is preserved, never
    // prematurely merged or ranked.
    // ===============================================================
    {
        const world = makeWorld('b');

        // Same Publication, same contentHash, different locator, different
        // discovery origin (Local vs. Nostr vs. Arweave) — three
        // independently-useful retrieval claims for the identical bytes.
        const bytesShared = 'Section B: one Publication, one contentHash, three locators';
        const localRef = await place(world, bytesShared);
        const nostrRef = await place(world, bytesShared);
        const arweaveRef = await place(world, bytesShared);
        assert(localRef.hash === nostrRef.hash && nostrRef.hash === arweaveRef.hash, 'B setup: all three placements genuinely share one contentHash');
        addLocalPlacement(world, { publicationId: 'pub-b', reference: localRef });
        addNostrAnnouncement(world, { publicationId: 'pub-b', reference: nostrRef });
        addArweaveAnnouncement(world, { publicationId: 'pub-b', reference: arweaveRef });

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: world.nostrSource,
            arweaveSnapshotDiscoveryQueryService: world.arweaveSource,
            placementCatalog: world.placementCatalog
        });
        const candidates = await queryService.search('tag-b');
        assert(candidates.length === 3, 'B1. one Publication + one contentHash + three distinct locators/origins produces THREE candidates, never collapsed to one because they "are the same content"');
        const locatorsSeen = new Set(candidates.map((c) => c.locator));
        assert(locatorsSeen.size === 3, 'B2. all three locators are individually preserved');

        // Different Publication, same contentHash, different locator —
        // e.g. two unrelated Publications whose Snapshots happen to be
        // byte-identical (an empty World, say).
        const differentPubRef = await place(world, bytesShared);
        addLocalPlacement(world, { publicationId: 'pub-b-other', reference: differentPubRef, id: 'placement-b-other' });
        const candidatesAfter = await queryService.search('tag-b');
        const distinctPublicationIds = new Set(candidatesAfter.map((c) => c.publicationId).filter(Boolean));
        assert(distinctPublicationIds.has('pub-b') && distinctPublicationIds.has('pub-b-other'), 'B3. a second, unrelated Publication sharing the identical contentHash is preserved as its own, separately-attributed candidate — never merged into pub-b just because the bytes match');

        // The one legitimate collapse: two sources reporting the IDENTICAL
        // storage+contentHash+locator triple ARE the same retrieval claim
        // — first-seen-wins, source order determines which one's own
        // metadata (here, publicationId) survives.
        const identicalRef = await place(world, 'Section B: identical locator claim from two sources');
        addLocalPlacement(world, { publicationId: 'pub-b-local-claim', reference: identicalRef, id: 'placement-b-identical' });
        addNostrAnnouncement(world, { publicationId: 'pub-b-nostr-claim', reference: identicalRef });
        const candidatesWithCollision = await queryService.search('tag-b');
        const collided = candidatesWithCollision.filter((c) => c.locator === identicalRef.uri);
        assert(collided.length === 1, 'B4. the SAME storage+contentHash+locator triple, reported by two different sources, collapses to exactly one candidate — this is the one case that IS the same claim');
        assert(collided[0].publicationId === 'pub-b-nostr-claim' || collided[0].publicationId === 'pub-b-local-claim', 'B5. the surviving candidate keeps whichever source\'s own metadata arrived first in source order, never a merge of both');
    }
    console.log('✓ Section B: candidate multiplicity is preserved exactly along the lines core/PublicationSnapshotPlacement.js and application/snapshot/SnapshotCandidateDiscoveryQueryService.js already establish (storage+contentHash+locator identity, contentHash-sharing across unrelated Publications preserved, publicationId never part of the dedup key) — reconfirms 0.9.150/0.9.485/0.9.500 with fresh, real, hash-derived data.');

    // ===============================================================
    // SECTION C — Discovery does not silently become verification.
    // ===============================================================
    {
        const world = makeWorld('c');
        const reference = await place(world, 'Section C: a discovered, unverified candidate');
        addNostrAnnouncement(world, { reference });
        const candidates = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag-c', discoveryQueryService: world.nostrSource });
        assert(candidates.length === 1, 'C1. discovery reports exactly the one announced candidate');
        const allowedKeys = new Set(['contentHash', 'locator', 'storage', 'publicationId', 'claimedPosition']);
        for (const key of Object.keys(candidates[0])) {
            assert(allowedKeys.has(key), `C2. a discovered candidate carries no field beyond the documented contract — found unexpected key "${key}", which would be exactly the kind of accidental "verified"/"trusted"/"confidence" field this pipeline must never grow`);
        }
        assert(!('verified' in candidates[0]) && !('trusted' in candidates[0]) && !('confidence' in candidates[0]), 'C3. no verification/trust vocabulary appears on a bare discovery result');

        // A lead "looking like" a perfect textual match is still never
        // auto-confirmed without an explicit association as evidence —
        // 0.9.28's own "evidence is supplied, never inferred," reconfirmed
        // live: a lead array containing an exact-looking match, with zero
        // associations, resolves UNAVAILABLE, never RESOLVED.
        const lookalikeLead = { origin: 'some-index', discoveryTag: 'tag', uri: 'ipfs://obj-c-perfect-match' };
        const noEvidenceResolution = resolveDecentralizedWorldEncounterLead({
            requestedMaterial: { kind: 'PUBLICATION', objectId: 'obj-c-perfect-match' },
            leads: [lookalikeLead],
            associations: []
        });
        assert(noEvidenceResolution.status === 'UNAVAILABLE', 'C4. a lead whose own uri textually resembles the requested object is never auto-resolved without explicit evidence — resemblance is not evidence');
    }
    console.log('✓ Section C: discovery output carries no verification vocabulary, and lead resolution never treats textual resemblance as evidence — reconfirms 0.9.150 and 0.9.28.');

    // ===============================================================
    // SECTION D — Selection carries into Resolution as the EXACT
    // selected locator/identity, never re-derived by contentHash.
    // ===============================================================
    {
        const world = makeWorld('d');
        // Candidate A: genuinely placed, genuinely resolvable.
        const bytesA = 'Section D: candidate A, the genuine placement';
        const referenceA = await place(world, bytesA);
        addLocalPlacement(world, { publicationId: 'pub-d', reference: referenceA });

        // Candidate B: a SECOND, later-discovered announcement CLAIMING
        // the identical contentHash as A, but whose own locator actually
        // serves different bytes — the adversarial shape 0.9.152's own
        // test suite already proved against the bare resolver; reproduced
        // here through the FULL composed multi-source runtime and the
        // real OwnPublicationPanel UI, never the resolver in isolation.
        const decoyReference = await place(world, 'Section D: candidate B\'s OWN, different bytes');
        addNostrAnnouncement(world, { publicationId: 'pub-d', reference: { hash: referenceA.hash, uri: decoyReference.uri, storage: decoyReference.storage } });

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: world.nostrSource,
            placementCatalog: world.placementCatalog
        });
        const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag-d', discoveryQueryService: queryService });
        const resolveSelectedSnapshotCommand = (candidate) => world.resolver.resolveCandidate(candidate, { storeRegistry: world.registry });

        const ctx = panelCtx({ discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2, 'D1. both candidates are surfaced, unranked, sharing one contentHash');
        const candidateA = ctx.snapshotCandidateDiscoveryResult.find((c) => c.locator === referenceA.uri);
        const candidateB = ctx.snapshotCandidateDiscoveryResult.find((c) => c.locator === decoyReference.uri);
        assert(candidateA && candidateB, 'D2. both the genuine and the decoy candidate are individually present');

        // Selecting B and resolving must attempt EXACTLY B's own locator —
        // never re-search by contentHash, which would deterministically
        // pick whichever candidate was discovered first (here, A).
        ctx.selectSnapshotCandidate(candidateB);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.locator === decoyReference.uri, 'D3. resolving the SELECTED candidate B attempts B\'s own locator, never silently substituting A\'s');
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'D4. B\'s own bytes genuinely disagree with the claimed contentHash — honestly reported as a mismatch, never masked by A\'s validity');

        // Selecting A afterward must resolve A cleanly — proving this is
        // a genuine per-candidate resolution, not a cached failure.
        ctx.selectSnapshotCandidate(candidateA);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D5. selecting the OTHER candidate sharing the same contentHash resolves independently, and correctly, to RESOLVED');
        assert(ctx.selectedSnapshotResolutionResult.locator === referenceA.uri, 'D6. ...against A\'s own locator specifically');
    }
    console.log('✓ Section D: selection survives into resolution as the caller\'s exact chosen locator, exercised end to end through the composed multi-source runtime and the real OwnPublicationPanel UI (not just the bare resolver 0.9.152\'s own suite already covers) — the dangerous "re-search by contentHash" shortcut this milestone\'s own requesting brief names as the central risk does not exist anywhere in this path.');

    // ===============================================================
    // SECTION E — A failed or mismatching resolution never mutates
    // the candidate into a different one.
    // ===============================================================
    {
        const world = makeWorld('e');
        const bytes = 'Section E: verification failure must not mutate identity';
        const genuineReference = await place(world, bytes);
        // A candidate CLAIMING genuineReference's hash but pointing at a
        // locator this world never placed anything under.
        const forgedCandidate = Object.freeze({ contentHash: genuineReference.hash, locator: 'ar://never-placed', storage: 'ar' });

        const storeUnavailableResult = await world.resolver.resolveCandidate(forgedCandidate, { storeRegistry: new SnapshotPlacementStoreRegistry() });
        assert(storeUnavailableResult.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, 'E1. an unregistered storage backend fails honestly');
        assert(storeUnavailableResult.candidates[0] === forgedCandidate, 'E2. the failure result still names the EXACT candidate object handed in, by reference — never a substitute, never a copy standing in for it');

        const contentUnavailableResult = await world.resolver.resolveCandidate(forgedCandidate, { storeRegistry: world.registry });
        assert(contentUnavailableResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, 'E3. a registered store with nothing at that locator fails honestly, distinctly from STORE_UNAVAILABLE');
        assert(contentUnavailableResult.candidates[0] === forgedCandidate, 'E4. same identity-preservation guarantee for this failure mode');

        // A locator that DOES resolve, but to the wrong bytes.
        const wrongBytesReference = await place(world, 'Section E: the wrong bytes entirely');
        const mismatchCandidate = Object.freeze({ contentHash: genuineReference.hash, locator: wrongBytesReference.uri, storage: wrongBytesReference.storage });
        const mismatchResult = await world.resolver.resolveCandidate(mismatchCandidate, { storeRegistry: world.registry });
        assert(mismatchResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'E5. retrieved-but-wrong bytes are reported as a mismatch, never silently accepted');
        assert(mismatchResult.candidates[0] === mismatchCandidate, 'E6. and STILL the exact original candidate object — a failed verification never promotes some OTHER, coincidentally-valid candidate in its place');
        assert(mismatchResult.candidates.length === 1, 'E7. no fallback candidate is fabricated or appended');
        assert(mismatchResult.bytes === null, 'E8. no bytes are exposed for a candidate that failed verification');
    }
    console.log('✓ Section E: every resolution failure mode (STORE_UNAVAILABLE, CONTENT_UNAVAILABLE, CONTENT_HASH_MISMATCH) reports the exact candidate object handed in, by reference — a failed resolution never mutates, replaces, or upgrades the candidate it was asked to resolve. Reconfirms application/snapshot/DecentralizedSnapshotResolver.js\'s own 0.9.134/0.9.152 contract with an explicit reference-identity check no prior test asserted this directly.');

    // ===============================================================
    // SECTION F — Multi-source convergence stays failure-isolated,
    // source-blind, non-ranking, non-fallback.
    // ===============================================================
    {
        const world = makeWorld('f');

        // Local: this replica's own, directly-created placement.
        const localBytes = 'Section F: Local origin';
        const localRef = await place(world, localBytes);
        addLocalPlacement(world, { publicationId: 'pub-f', reference: localRef, id: 'placement-f-local' });

        // Peer: application/snapshot/placement/PublicationSnapshotPlacementPeerExchange.js's
        // own, already-production passive ANNOUNCE path (0.9.483/0.9.484)
        // delivers a peer-originated placement into this SAME catalog —
        // the catalog itself carries no origin field (0.9.485's own
        // header), so a peer-delivered placement is added exactly the way
        // that production path already adds one: as a second, ordinary
        // catalog entry. This file does not re-derive the two-peer wire
        // protocol 0.9.484's own flagship harness already proved live;
        // it reconfirms only that this SAME catalog, once populated
        // either way, contributes uniformly to candidate discovery.
        const peerBytes = 'Section F: Peer-delivered origin';
        const peerRef = await place(world, peerBytes);
        addLocalPlacement(world, { publicationId: 'pub-f', reference: peerRef, id: 'placement-f-peer' });

        // Nostr and Arweave: genuine announcements.
        const nostrBytes = 'Section F: Nostr origin';
        const nostrRef = await place(world, nostrBytes);
        addNostrAnnouncement(world, { publicationId: 'pub-f', reference: nostrRef });

        const arweaveBytes = 'Section F: Arweave origin';
        const arweaveRef = await place(world, arweaveBytes);
        addArweaveAnnouncement(world, { publicationId: 'pub-f', reference: arweaveRef });

        // A fifth, deliberately BROKEN source — throws synchronously
        // inside search() — composed directly (bypassing
        // composeSnapshotCandidateDiscoveryRuntime, which only accepts
        // Local/Nostr/Arweave) purely to prove failure isolation at the
        // composite boundary a fourth-and-fifth-source shape would hit.
        const brokenSource = { search() { throw new Error('Section F: this source is deliberately broken'); } };

        const compositeService = new SnapshotCandidateDiscoveryQueryService([
            world.localSource, world.nostrSource, world.arweaveSource, brokenSource
        ]);
        const results = await compositeService.search('tag-f');

        assert(results.length === 4, 'F1. Local (x2, Local+Peer) + Nostr + Arweave all contribute despite the fifth source being broken — one failing source never fails the whole call');
        const locatorsSeen = new Set(results.map((c) => c.locator));
        assert(locatorsSeen.has(localRef.uri) && locatorsSeen.has(peerRef.uri) && locatorsSeen.has(nostrRef.uri) && locatorsSeen.has(arweaveRef.uri), 'F2. all four conceptual origins\' own candidates are individually present');

        // Non-ranking: order is source-array order, then per-source
        // arrival order — never re-sorted by hash, locator, or anything
        // else.
        const localCandidateIndices = results.map((c, i) => (c.locator === localRef.uri || c.locator === peerRef.uri ? i : -1)).filter((i) => i >= 0);
        const nostrCandidateIndex = results.findIndex((c) => c.locator === nostrRef.uri);
        const arweaveCandidateIndex = results.findIndex((c) => c.locator === arweaveRef.uri);
        assert(Math.max(...localCandidateIndices) < nostrCandidateIndex, 'F3. Local\'s own candidates precede Nostr\'s — source array order, never a re-sort');
        assert(nostrCandidateIndex < arweaveCandidateIndex, 'F4. Nostr precedes Arweave — same rule');

        // Non-fallback: removing the broken source changes nothing about
        // the OTHER four candidates — no source ever stands in for
        // another's absence.
        const withoutBroken = new SnapshotCandidateDiscoveryQueryService([world.localSource, world.nostrSource, world.arweaveSource]);
        const resultsWithoutBroken = await withoutBroken.search('tag-f');
        assert(resultsWithoutBroken.length === 4, 'F5. removing the broken source changes nothing about the surviving four — nothing was ever standing in for it');

        // Source-blind: no candidate carries any field naming which
        // source produced it.
        for (const candidate of results) {
            assert(!('source' in candidate) && !('origin' in candidate), 'F6. no candidate carries a source/origin field — downstream code (resolution, verification) cannot even ask which substrate a candidate came from, let alone prefer one');
        }
    }
    console.log('✓ Section F: Local + Peer (via the shared placement catalog, per 0.9.483/0.9.484\'s own already-production passive path) + Nostr + Arweave converge through Promise.allSettled() exactly as application/snapshot/SnapshotCandidateDiscoveryQueryService.js already guarantees — failure-isolated, arrival-ordered (never re-ranked), non-fallback, and source-blind. Reconfirms 0.9.485/0.9.500 with all four origins in the SAME call, including one genuinely broken fifth source neither prior audit exercised.');

    // ===============================================================
    // SECTION G — Walking-triggered discovery: movement is merely a
    // trigger, never a source of identity or verification semantics.
    // ===============================================================
    {
        const world = makeWorld('g');
        const reference = await place(world, 'Section G: walking-triggered discovery');
        addNostrAnnouncement(world, { reference });

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: world.nostrSource,
            placementCatalog: world.placementCatalog
        });
        let searchCalls = 0;
        const countingQueryService = { search: (tag) => { searchCalls += 1; return queryService.search(tag); } };
        const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag-g', discoveryQueryService: countingQueryService });
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });

        const near = { position: { x: 0, y: 0, z: 0 } };
        const stillNear = { position: { x: 0.01, y: 0, z: 0 } };
        const far = { position: { x: 500, y: 0, z: 0 } };

        await monitor.observe(near);
        assert(searchCalls === 1, 'G1. first observation always triggers a discovery call');
        await monitor.observe(stillNear);
        assert(searchCalls === 1, 'G2. sub-threshold movement never triggers a second call — movement is a GATE, not an independent trigger for its own sake');
        await monitor.observe(far);
        assert(searchCalls === 2, 'G3. genuine movement past the threshold triggers a fresh call');
        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].locator === reference.uri, 'G4. the monitor\'s own result is exactly discoverSnapshotCandidatesCommand()\'s own result, unmodified by position');

        // Structural: the monitor never imports resolution, verification,
        // materialization, or placement — movement decides WHEN to ask,
        // never WHAT the answer means.
        const monitorCode = await codeOnlySource('application/snapshot/WorldSnapshotDiscoveryMonitor.js');
        for (const forbidden of ['DecentralizedSnapshotResolver', 'ContentReference', 'SnapshotPlacementResolver', 'MaterializeSnapshot', 'registerMaterializedSnapshot', 'WorldEncounter']) {
            assert(!monitorCode.includes(forbidden), `G5. WorldSnapshotDiscoveryMonitor.js's own CODE never references ${forbidden} — movement triggers discovery only, never resolution/verification/materialization/placement/encounter semantics (its own header comment may still discuss the boundary in prose)`);
        }
        // And a candidate produced under this walking-triggered path
        // carries no position-derived field of its own.
        assert(!('position' in monitor.lastResult[0]) && !('distance' in monitor.lastResult[0]), 'G6. the discovered candidate itself carries no trace of the Wanderer\'s own position — movement is the trigger, never part of the candidate\'s own identity');
    }
    console.log('✓ Section G: the real WorldSnapshotDiscoveryMonitor, composed with real Local+Nostr sources, triggers discovery on genuine movement only, never on sub-threshold jitter, and injects no positional/verification semantics into either the trigger or the resulting candidates — reconfirms 0.9.186/0.9.485 live with a call-counting harness neither prior audit used.');

    // ===============================================================
    // SECTION H — Stale candidate lifecycle: a late, even genuinely
    // VALID result for an abandoned selection never becomes current.
    // ===============================================================
    {
        const world = makeWorld('h');
        const bytesA = 'Section H: candidate A — independently, genuinely valid';
        const bytesB = 'Section H: candidate B — also independently, genuinely valid, and sharing A\'s own contentHash';
        // Two HONEST placements that happen to share a contentHash would
        // require colliding sha256 inputs, which is infeasible to
        // construct in a test — so this section instead proves the
        // harder-to-get-right shape directly: A's own resolution
        // genuinely completing (RESOLVED, real bytes, no error of any
        // kind) is STILL discarded once the selection has moved on to B,
        // exactly because "the result was valid" is never the test this
        // boundary applies — "is it still the current selection" is.
        const referenceA = await place(world, bytesA);
        const referenceB = await place(world, bytesB);
        const candidateA = Object.freeze({ contentHash: referenceA.hash, locator: referenceA.uri, storage: referenceA.storage });
        const candidateB = Object.freeze({ contentHash: referenceB.hash, locator: referenceB.uri, storage: referenceB.storage });

        const attemptA = deferred();
        let resolveCallCount = 0;
        const resolveSelectedSnapshotCommand = (candidate) => {
            resolveCallCount += 1;
            if (candidate === candidateA) return attemptA.promise;
            return world.resolver.resolveCandidate(candidate, { storeRegistry: world.registry });
        };

        const ctx = panelCtx({ resolveSelectedSnapshotCommand });
        ctx.selectSnapshotCandidate(candidateA);
        ctx.resolveSelectedSnapshot();
        assert(ctx.selectedSnapshotResolutionExecuting === true, 'H1. resolving A is genuinely in flight');

        // Before A's resolution settles, the Wanderer selects B instead.
        ctx.selectSnapshotCandidate(candidateB);
        assert(ctx.selectedSnapshotResolutionExecuting === false, 'H2. selecting a different candidate immediately resets in-flight state — no waiting for A\'s own stale call');
        assert(ctx.selectedSnapshotCandidate === candidateB, 'H3. the current selection is genuinely B');

        // A's promise NOW resolves — successfully, honestly, with real,
        // verifiable bytes for A's own locator. This is the adversarial
        // case: a late arrival that is not an error, not a mismatch, not
        // corrupted — just LATE.
        attemptA.resolve(await world.resolver.resolveCandidate(candidateA, { storeRegistry: world.registry }));
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult === null, 'H4. FLAGSHIP — A\'s late-arriving, GENUINELY VALID (RESOLVED) result is still discarded, because it no longer belongs to the current selection. Validity of the result is never the test this boundary applies.');
        assert(ctx.selectedSnapshotCandidate === candidateB, 'H5. the selection itself remains genuinely B throughout');

        // Resolving B for real afterward produces B\'s own, uncontaminated
        // result.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'H6. B resolves cleanly and independently');
        assert(ctx.selectedSnapshotResolutionResult.locator === referenceB.uri, 'H7. ...against B\'s own locator, never contaminated by A\'s earlier, late-arriving attempt');
        assert(resolveCallCount === 2, 'H8. exactly two resolution attempts were ever made — one for A (abandoned), one for B (accepted) — no hidden retry or re-resolution occurred');
    }
    console.log('✓ Section H: a late-arriving resolution result for an ABANDONED selection is discarded even when that result is genuinely valid, not merely erroneous — the requestId guard in ui/components/OwnPublicationPanel.js#selectSnapshotCandidate()/resolveSelectedSnapshot() (0.9.152 onward) tests "is this still the current selection," never "was this result correct." Extends 0.9.157\'s own Section E ("Ei") scenario with the strictly harder validity case that section did not itself construct.');

    // ===============================================================
    // SECTION I — User-facing vocabulary never overclaims beyond a
    // discovery/selection/retrieval/hash-match claim.
    // ===============================================================
    {
        const forbiddenPattern = /\btrusted\b|\bauthentic\b|\bofficial\b|\bowned\b|\brecommended\b|\bbest snapshot\b|\bpreferred\b/i;

        for (const file of ['ui/components/OwnPublicationPanel.js', 'ui/components/WorldEncounterCanvas.js']) {
            const raw = await rawSource(file);
            const templateMatch = raw.match(/template: `([\s\S]*)`\s*};?\s*$/);
            assert(templateMatch, `I1. ${file} exposes a single template literal this section can inspect`);
            // HTML comments (`<!-- ... -->`) inside the template literal are
            // developer notes about what is deliberately NOT rendered (e.g.
            // "no ... 'trusted' label" — the very discipline this section
            // means to confirm) — never text a Wanderer actually sees, so
            // they are stripped before checking, exactly as codeOnlySource()
            // already strips them for structural checks elsewhere.
            const template = templateMatch[1].replace(/<!--[\s\S]*?-->/g, '');
            assert(!forbiddenPattern.test(template), `I2. ${file}'s own ACTUALLY-RENDERED template markup (HTML comments excluded) contains no accidental trust/ownership/preference claim (trusted/authentic/official/owned/recommended/"best snapshot"/preferred)`);
            assert(!/\bverified\b/i.test(template), `I3. ${file}'s own actually-rendered template never uses the bare word "verified" — see application/snapshot/SnapshotOutcomeInspectionView.js's own 0.9.528 "Confirmed to match" discipline instead`);
        }

        // The actual label vocabulary a candidate's own lifecycle renders
        // through, confirmed to match the Discovered -> Selected ->
        // Retrieved -> Confirmed-to-match progression, never a stronger
        // claim.
        assert(/Discovered Snapshots/i.test((await Promise.all(ownPublicationPanelFiles().map((file) => rawSource(file)))).join('\n')), 'I4. the candidate list is headed "Discovered," matching the first stage of the requested progression');
        assert(describeSnapshotResolutionOutcomeLabel(DecentralizedSnapshotResolutionOutcome.RESOLVED).toLowerCase().includes('retrieved'), 'I5. a successful resolution is labeled "Retrieved," matching the third stage');
        assert(describeSnapshotAttributionOutcomeLabel('match').toLowerCase().includes('confirmed to match'), 'I6. a hash match is labeled "Confirmed to match," matching the fourth stage — never "verified," "authentic," or "owned"');

        // Selection state ("Selected") is real, structural UI state, not
        // merely a label — reconfirm the CSS-class binding exists.
        const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => rawSource(file)))).join('\n');
        assert(panelSource.includes('own-publication-candidate-item-selected'), 'I7. the second stage, "Selected," corresponds to a genuine, distinct UI state (a CSS class keyed to selectedSnapshotCandidate), not merely an unlabeled click');
    }
    console.log('✓ Section I: neither candidate-facing template renders a trust/authenticity/ownership/preference claim, and the actual label vocabulary a Wanderer sees follows exactly Discovered -> Selected -> Retrieved -> Confirmed to match, with no stronger word anywhere in the pipeline — reconfirms 0.9.151/0.9.157\'s own inline "never labels a candidate best/trusted/recommended" comment and 0.9.528\'s label tables, by reading the ACTUAL rendered template text rather than trusting the comment.');

    // ===============================================================
    // SECTION J — Flagship: the complete Discover -> Select -> Resolve
    // -> Verify journey across all four origins, with a same-contentHash
    // decoy arriving AFTER selection.
    // ===============================================================
    {
        const world = makeWorld('j');
        const publicationId = 'pub-j-flagship';

        const localRef = await place(world, 'Flagship: Local origin bytes');
        addLocalPlacement(world, { publicationId, reference: localRef, id: 'placement-j-local' });

        // Peer — see Section F's own note: indistinguishable, by design,
        // from a second Local catalog entry.
        const peerRef = await place(world, 'Flagship: Peer-delivered origin bytes');
        addLocalPlacement(world, { publicationId, reference: peerRef, id: 'placement-j-peer' });

        const nostrRef = await place(world, 'Flagship: Nostr origin bytes');
        addNostrAnnouncement(world, { publicationId, reference: nostrRef });

        const arweaveRef = await place(world, 'Flagship: Arweave origin bytes — this is the one the Wanderer will select');
        addArweaveAnnouncement(world, { publicationId, reference: arweaveRef });

        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: world.nostrSource,
            arweaveSnapshotDiscoveryQueryService: world.arweaveSource,
            placementCatalog: world.placementCatalog
        });
        const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag-j', discoveryQueryService: queryService });
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });

        // 1. Walk — a movement threshold crossing triggers discovery.
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        await monitor.observe({ position: { x: 1000, y: 0, z: 0 } });
        assert(monitor.lastResult.length === 4, 'J1. WALK triggers discovery across all four origins — Local, Peer (via the shared catalog), Nostr, and Arweave — in one composed call');

        // 2. Show candidates (feed the monitor's own result into the real
        // candidate-browsing UI, exactly as a real caller would).
        const resolveSelectedSnapshotCommand = (candidate) => world.resolver.resolveCandidate(candidate, { storeRegistry: world.registry });
        const publication = new Publication({ id: publicationId, documentId: 'doc-j-flagship' });
        const ctx = panelCtx({ publication, discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand });
        ctx.snapshotCandidateDiscoveryResult = monitor.lastResult;
        const arweaveCandidate = ctx.snapshotCandidateDiscoveryResult.find((c) => c.locator === arweaveRef.uri);
        assert(arweaveCandidate, 'J2. the Arweave-discovered candidate is present among the shown candidates');

        // 3. Select one — explicitly, the Arweave-sourced candidate.
        ctx.selectSnapshotCandidate(arweaveCandidate);
        assert(ctx.selectedSnapshotCandidate === arweaveCandidate, 'J3. SELECT records the Wanderer\'s own explicit choice');

        // 4. Resolve exact locator, 5. Verify bytes.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'J4. RESOLVE + VERIFY succeed against the selected candidate\'s own locator');
        assert(ctx.selectedSnapshotResolutionResult.locator === arweaveRef.uri, 'J5. ...specifically the Arweave locator the Wanderer selected, never one of the other three');
        const establishedResult = ctx.selectedSnapshotResolutionResult;
        const establishedCandidate = ctx.selectedSnapshotCandidate;

        // Deliberately make another candidate share the SAME contentHash
        // — a decoy Nostr announcement claiming Arweave's own contentHash
        // but a different (invalid) locator — and re-run discovery, the
        // way a background WorldSnapshotDiscoveryMonitor tick naturally
        // would while the Wanderer is still looking at their existing,
        // already-resolved selection.
        const decoyRef = await place(world, 'Flagship: a DECOY sharing the selected candidate\'s own contentHash');
        addNostrAnnouncement(world, { publicationId, reference: { hash: arweaveRef.hash, uri: decoyRef.uri, storage: decoyRef.storage } });
        await monitor.observe({ position: { x: 2500, y: 0, z: 0 } });
        ctx.snapshotCandidateDiscoveryResult = monitor.lastResult;
        assert(ctx.snapshotCandidateDiscoveryResult.some((c) => c.locator === decoyRef.uri), 'J6. the decoy genuinely appears in a fresh discovery pass');

        // THE CENTRAL INVARIANT THIS MILESTONE'S OWN BRIEF NAMES AS MOST
        // IMPORTANT: the Publication the Wanderer already selected and
        // resolved remains exactly that one — a new, same-contentHash
        // candidate arriving from discovery never silently becomes the
        // current selection or resolution.
        assert(ctx.selectedSnapshotCandidate === establishedCandidate, 'J7. FLAGSHIP — the Wanderer\'s own selection is untouched by a fresh discovery pass surfacing a same-contentHash decoy; the system never "helpfully" re-selects on the Wanderer\'s behalf');
        assert(ctx.selectedSnapshotResolutionResult === establishedResult, 'J8. FLAGSHIP — the already-established, verified resolution result is likewise untouched — no re-resolution was silently triggered by the new discovery result either');
        assert(ctx.selectedSnapshotResolutionResult.locator === arweaveRef.uri, 'J9. the resolution the Wanderer is looking at still names the Arweave locator they actually chose, never the decoy');

        // Only an EXPLICIT new selection could ever change any of this.
        ctx.selectSnapshotCandidate(ctx.snapshotCandidateDiscoveryResult.find((c) => c.locator === decoyRef.uri));
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'J10. and if the Wanderer DOES explicitly pick the decoy, it is honestly reported as a mismatch, never silently accepted just because it shares a contentHash with a candidate that once resolved correctly');
    }
    console.log('✓ Section J: FLAGSHIP — Walk -> discover across Local+Peer+Nostr+Arweave -> show candidates -> select one explicitly -> resolve its exact locator -> verify bytes -> a same-contentHash decoy arriving afterward from a fresh discovery pass never displaces the Wanderer\'s own already-established selection or resolution, and an explicit re-selection onto the decoy is itself honestly reported as a mismatch. The dangerous "system finds candidate B with the same contentHash and silently continues with B" scenario this milestone\'s own requesting brief names does not occur anywhere in this journey.');

    console.log('\nAll Publication Discovery Lead Lifecycle Product Reassessment tests passed.');

    console.log(`\n=== 0.9.538 VERDICT ===
PRODUCT_COMPLETE. This milestone's own question — does a Wanderer receive an honest, stable experience while moving
from an unverified discovery lead toward a selected and verified Publication, across Local/Peer/Nostr/Arweave — is
answered YES, for every boundary the requesting brief named: five identity concepts (Publication identity, content
identity, locator, discovery artifact/announcement id, discovery origin) stay independently tracked across BOTH of
this codebase's own discovery-lead vocabularies, confirmed structurally distinct as well as behaviorally distinct
(A); candidate multiplicity survives contentHash-sharing both within and across Publications, with the one genuine
collapse (an identical storage+contentHash+locator triple) never merging metadata (B); discovery output carries no
verification vocabulary and lead resolution never treats textual resemblance as evidence (C); selection survives
into resolution as the caller's EXACT chosen locator, proven through the full composed multi-source runtime and the
real UI rather than the bare resolver alone (D); every resolution failure mode preserves the original candidate by
reference, never mutating or substituting it (E); four-origin convergence stays failure-isolated, arrival-ordered,
non-fallback, and source-blind, including a fifth, genuinely broken source (F); the real WorldSnapshotDiscoveryMonitor
triggers discovery on genuine movement only and injects no positional or verification semantics anywhere (G); a
late-arriving resolution for an abandoned selection is discarded even when it is genuinely valid, not merely
erroneous (H); the actual rendered UI vocabulary follows Discovered -> Selected -> Retrieved -> Confirmed to match,
with no trust/authenticity/ownership/preference word anywhere in either candidate-facing template (I); and one
flagship journey across all four origins proves the milestone's own named central risk — a same-contentHash decoy
silently displacing an already-selected, already-resolved Publication — does not occur (J).

This is a REASSESSMENT, not a first discovery: every invariant above was already established by a specific prior
milestone (0.9.24, 0.9.28, 0.9.133-171, 0.9.150-158, 0.9.485-500, 0.9.528 — cited inline throughout this file), each
independently, none of them combined this way before. No gap was found in any of the ten sections the requesting
brief asked for. Per that brief's own closing instruction, this milestone recommends STOPPING this family of product
audits: the Discovery -> Publication -> Repository -> World chain (0.9.24 through 0.9.537) is now exceptionally well
covered end to end, from an unverified search hit or announcement all the way through a rendered World Encounter,
with every boundary this line of milestones has ever named still holding on fresh, live re-examination.

This is a TEST-ONLY milestone: one new file, tests/PublicationDiscoveryLeadLifecycleProductReassessment.test.js,
registered in tests.html. No production file was changed. No candidate ranking, automatic fallback, automatic
candidate substitution, candidate caching, new discovery protocol, new relay/Arweave/Snapshot/World Encounter
behavior, new verification mechanism, new Publication identity, automatic retry, automatic fan-out, or new
provenance vocabulary was introduced anywhere, exactly as this milestone's own requesting brief's "deliberately
exclude" list requires.`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
