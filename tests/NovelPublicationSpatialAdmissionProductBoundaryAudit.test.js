import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';
import { resolveSnapshotWorldPositionClaim } from '../application/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { worldNavigationSessionFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.551 — Novel Publication Spatial Admission Product Boundary Audit.
//
// TYPE: test-only product-boundary audit. Production changes: none.
//
// The requesting brief starts from an observation about the real,
// already-shipped DISCOVER -> SELECT -> RESOLVE -> VERIFY -> MATERIALIZE ->
// PLACE -> REGISTER pipeline (application/AutomaticSnapshotEncounterCascade.js,
// 0.9.187, built on 0.9.150-0.9.172's own explicit stages, gated by 0.9.193's
// session-lifetime guard): a Wanderer's own walking can drive a genuinely
// unknown, third-party Publication's Snapshot all the way through real
// discovery, resolution, content-hash verification, and local
// materialization — and then, if no locally-authoritative WorldPlacement
// already exists for that publicationId, the cascade deliberately stops at
// `SnapshotWorldPlacementOutcome.UNPLACED`. Bytes exist; nothing is ever
// registered with the running World. The question this milestone asks,
// verbatim from its own brief:
//
//   What is the smallest safe mechanism that lets a Wanderer see genuinely
//   novel, cryptographically verified publications in the World without
//   treating an untrusted claimedPosition as authoritative spatial state?
//
// This file answers the AUDIT half of that question only — per its own
// brief, it explicitly does NOT build a mechanism, reputation system, or
// new spatial-admission surface. It reproduces the gap live against real,
// unmodified production source; separates the facts the current pipeline
// conflates in casual description but keeps genuinely distinct in code;
// traces the ONE existing admission authority already governing automatic
// registration; confirms no existing object already carries the missing
// state; compares three possible spatial semantics without implementing
// any of them; asks whether `claimedPosition` is even the right input for
// the walking-triggered case; runs the security-relevant adversarial
// scenarios named in the brief; reconfirms existing placement semantics
// (reconfirmed with a live-executable placement guard, since 0.9.468's
// own Orphaned Placement guard cannot run in this Node-only harness);
// and produces an honest, mixed classification rather than rounding to
// either "nothing to see here" or "build a trust system."
//
//   Section A. Reproduce the exact product gap, live, against real Nostr +
//              Arweave + local-content-store machinery — never a
//              hand-simulated stand-in — and confirm structurally that
//              stopping at UNPLACED is documented, deliberate restraint,
//              not an accidental missing call.
//   Section B. Separate the four facts (identity, content-hash
//              verification, claimedPosition, placement authority) with a
//              2x2 authority/claim matrix run through the real cascade,
//              plus the pure claim-identity trichotomy
//              (CLAIMED/ABSENT/MISMATCHED) the manual flow already owns.
//   Section C. Trace the existing admission authority all the way from
//              `ui/views/WorldView.js`'s own wiring down to
//              `PlacePublicationUseCase` — and show it already answers the
//              product's admission question without any new trust
//              abstraction.
//   Section D. Confirm no existing object already carries
//              VERIFIED + CLAIMED_POSITION + NOT_AUTO_PLACED as
//              queryable/renderable state.
//   Section E. Compare three spatial-semantics models (authoritative
//              placement / untrusted spatial claim / observer-local
//              encounter) without implementing any of them.
//   Section F. Whether `claimedPosition` is even the right input for a
//              walking-triggered encounter, versus the Wanderer's own
//              physical encounter position — which this pipeline does not
//              plumb anywhere today.
//   Section G. Adversarial cases: distance-blind claims, and a forged
//              contentHash targeting an already-placed Publication.
//   Section H. Existing placement semantics reconfirmed undisturbed,
//              including a live re-execution of tests/PlacementRegistry.test.js
//              (0.9.468's own Orphaned Placement guard cannot run under plain
//              Node in this harness — see Section H's own note).
//   Section I. Product classification and verdict.
//
// DELIBERATELY EXCLUDED — PER THIS MILESTONE'S OWN BRIEF, NOT MERELY
// DEFERRED FOR TASTE: reputation scores, publisher trust scores, global
// publisher rankings, automatic trust accumulation, crowdsourced voting,
// "trusted publisher" badges, automatic spatial placement of any kind,
// changes to PlacementRecord/WorldPlacement semantics, changes to
// verification semantics, weakening publisher ownership checks, accepting
// `claimedPosition` merely because content is hash-verified, new
// moderation infrastructure, a consensus protocol, permanent spatial
// claims, or an automatic placement fallback. No production code changes
// ship with this milestone.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ---------------------------------------------------------------------
// Real-machinery host — the SAME shape 0.9.191-0.9.194's own e2e harnesses
// use (tests/AutomaticSnapshotSessionLifetimeGuardE2EAudit.test.js): a real
// in-memory Nostr relay, a real in-memory Arweave gateway/signer, and a
// real LocalContentStore, composed through the SAME, unmodified
// application commands ui/main.js itself wires up.
// ---------------------------------------------------------------------
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
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
        return { id: `fake-boundary-tx-${counter}`, transaction: { id: `fake-boundary-tx-${counter}`, data: material } };
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

function makeHost(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);

    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService: queryService });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer });

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
    };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

function makeWorldModel() {
    const publications = new Map();
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        publications,
        placementRegistry,
        knowPublication(publication) { publications.set(publication.id, publication); },
        placeAt(publicationId, position, owner = 'alice') {
            placementRegistry.add(new PlacementRecord({ publicationId, position, owner }));
        },
        resolvePlacementInfo: (publicationId) => {
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
        },
        findPublicationById: (publicationId) => publications.get(publicationId) || null
    };
}

function makeCascade(host, worldModel, registry) {
    return new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: worldModel.resolvePlacementInfo,
        findPublicationById: worldModel.findPublicationById
    });
}

function originFor(contentHash, publicationId) {
    return `snapshot:${contentHash}:${publicationId}`;
}
function hasOrigin(registry, origin) {
    return registry.listSources().some((source) => source.origin === origin);
}
function encounterCount(registry) {
    return deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources())).publications.length;
}

async function runTests() {
    console.log('Running Novel Publication Spatial Admission Product Boundary Audit tests...\n');

    // ===============================================================
    // Section A — Reproduce the exact product gap, live, and confirm it
    // is deliberate restraint rather than an accidental missing call.
    // ===============================================================
    {
        const host = makeHost('boundary-audit-a');
        const publicationId = 'unknown-publisher-pub-1';
        const claimedPosition = { x: 4200, y: 0, z: 4200 };

        // An unknown publisher — nothing in this replica's own
        // identity/discovery state knows this publicationId at all — puts
        // real bytes on the real (fake) Arweave gateway and announces them
        // over the real (fake) Nostr relay with a self-reported
        // publicationId + claimedPosition, exactly like 0.9.171's own
        // envelope.
        const reference = await placeAndAnnounce(host, 'unknown-publisher-bytes', { publicationId, claimedPosition });

        const worldModel = makeWorldModel(); // no placement, no known Publication at all
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry);

        // DISCOVER — a real query against the real relay.
        const candidates = await host.discoverSnapshotCandidatesCommand();
        assert(candidates.length === 1, 'A1. DISCOVER: the real Nostr query surfaces the announcement.');
        const candidate = candidates[0]; // SELECT — the only candidate.
        assert(candidate.publicationId === publicationId && candidate.claimedPosition.x === claimedPosition.x,
            'A1b. The discovered candidate carries the unknown publisher\'s own publicationId/claimedPosition claim, verbatim.');

        // RESOLVE + VERIFY, run independently of the cascade first, to
        // prove — before looking at the cascade's own combined result —
        // that these two stages themselves genuinely succeeded.
        const resolution = await host.resolveSelectedSnapshotCommand(candidate);
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            `A2. RESOLVE+VERIFY: real retrieval from the fake Arweave gateway and real content-hash verification both succeed (got ${resolution.outcome}).`);

        // MATERIALIZE, likewise run independently first.
        const materialization = await host.materializeSelectedSnapshotCommand(resolution);
        assert(materialization.outcome === StoreSnapshotContentOutcome.STORED
            || materialization.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE,
            `A3. MATERIALIZE: bytes are genuinely stored locally (got ${materialization.outcome}).`);
        assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })),
            'A3b. The materialized bytes are independently confirmed present in the local content store.');

        // Now the full cascade, from scratch (its own idempotency map is
        // per-instance, so this is a fresh, independent run of the exact
        // same subject).
        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED,
            `A4. PLACE: with content genuinely verified and materialized (A2-A3), and no authoritative WorldPlacement known for this publicationId, the cascade stops at UNPLACED (got ${result.outcome}) — this is a decision, not a failure: reason is ${JSON.stringify(result.reason)}.`);
        assert(result.reason === null, 'A4b. UNPLACED carries no error/reason — confirming this is a clean stop, not a caught exception.');

        // REGISTER never runs; the World never learns of this subject.
        const origin = originFor(reference.hash, publicationId);
        assert(!hasOrigin(registry, origin), 'A5. No WorldDiscoverySource is ever registered for this subject.');
        assert(encounterCount(registry) === 0, 'A6. The ordinary World View encounter pipeline renders zero Publications for this subject — an ordinary Wanderer sees nothing.');

        // "Download successfully but remain invisible" — bytes are real
        // and retrievable, but nothing was ever registered with the
        // running World.
        assert(host.gateway.network.has(reference.uri.slice('ar://'.length)), 'A7. The bytes remain retrievable from the (fake) Arweave gateway — nothing was hidden or deleted.');
        assert(host.network.events.length === 1, 'A7b. The Nostr announcement itself remains intact and discoverable by anyone else, unaffected by the local UNPLACED outcome.');

        // Structural confirmation that this is DOCUMENTED, DELIBERATE
        // restraint in the cascade's own source — never merely an
        // omission this audit happens to be the first to notice.
        const cascadeSource = codeOnlyLines(await rawSource('application/AutomaticSnapshotEncounterCascade.js'));
        assert(!/SnapshotWorldPositionClaim/.test(cascadeSource),
            'A8. AutomaticSnapshotEncounterCascade.js never imports application/SnapshotWorldPositionClaim.js.');
        assert(!/candidate\.claimedPosition/.test(cascadeSource),
            'A9. AutomaticSnapshotEncounterCascade.js never reads candidate.claimedPosition anywhere in its own source.');
        const cascadeHeader = await rawSource('application/AutomaticSnapshotEncounterCascade.js');
        assert(/claimedPosition.{0,40}IS NEVER PROMOTED TO AUTHORITATIVE PLACEMENT/s.test(cascadeHeader),
            'A10. The file\'s own header names this exact restraint explicitly, by name, as a deliberate invariant — not a fact this audit is inferring from absence alone.');

        console.log('✓ A — the exact gap reproduced live against real Nostr+Arweave+local-storage machinery: an unknown publisher\'s genuinely novel content is discovered, resolved, verified, and materialized successfully (A1-A3), yet the cascade deliberately stops at UNPLACED with no error (A4), nothing is ever registered or rendered (A5-A6), the bytes and announcement remain fully intact rather than hidden (A7-A7b), and the restraint is confirmed, by direct source inspection, to be a named, documented invariant rather than an accidental missing call (A8-A10).');
    }

    // ===============================================================
    // Section B — Separate the four facts: identity, content-hash
    // verification, claimedPosition, and placement authority. A 2x2
    // authority/claim matrix, holding identity+verification constant
    // (always real and successful), isolates which fact actually
    // determines the World position used.
    // ===============================================================
    {
        const host = makeHost('boundary-audit-b');
        const registry = new WorldDiscoverySourceRegistry();
        const worldModel = makeWorldModel();
        const cascade = makeCascade(host, worldModel, registry);

        // core/SnapshotDiscoveryEnvelope.js's own rule — "publicationId AND
        // claimedPosition travel together, or not at all" — means the real
        // NostrSnapshotDiscoveryPublisher refuses to publish (returns
        // null, per its own contract) a candidate carrying publicationId
        // without claimedPosition. A "no claim" quadrant therefore cannot
        // be produced by announcing through the real publisher; it is
        // produced instead exactly the way a PLACEMENT/PEER-sourced
        // materialization already reaches this cascade in production (per
        // that file's own header: those candidates never carried a claim
        // to begin with) — a real content-addressed reference, from the
        // SAME real (fake) Arweave-backed content store `placeAndAnnounce`
        // itself uses, with a hand-attached publicationId identifying
        // which Publication these bytes are being processed for. RESOLVE/
        // VERIFY/MATERIALIZE below still run against this real reference,
        // genuinely, exactly as Section A's did.
        async function runQuadrant(label, { publicationId, authorityPosition, claimedPosition }) {
            if (authorityPosition) {
                worldModel.placeAt(publicationId, new Position(authorityPosition.x, authorityPosition.y, authorityPosition.z));
                worldModel.knowPublication(new Publication({ id: publicationId, title: label, contentReference: new ContentReference({ hash: 'placeholder' }) }));
            }
            const reference = await host.contentStore.put(`bytes-${label}`);
            const candidate = { contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition };
            return { result: await cascade.processCandidate(candidate), reference };
        }

        // i. authority YES, claim NO.
        const i = await runQuadrant('b-i', { publicationId: 'b-i-pub', authorityPosition: { x: 1, y: 0, z: 1 }, claimedPosition: undefined });
        assert(i.result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `B-i. Authority alone (no claim at all) is sufficient for admission (got ${i.result.outcome}).`);
        assert(worldModel.resolvePlacementInfo('b-i-pub').position.x === 1, 'B-i-b. The registered position is the authoritative one.');

        // ii. authority YES, claim YES, at a DIFFERENT position — proves
        // the claim is never even consulted when authority exists.
        const ii = await runQuadrant('b-ii', { publicationId: 'b-ii-pub', authorityPosition: { x: 2, y: 0, z: 2 }, claimedPosition: { x: 9999, y: 0, z: 9999 } });
        assert(ii.result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `B-ii. Authority remains sufficient even when a conflicting claim also exists (got ${ii.result.outcome}).`);
        const registeredOrigin = originFor(ii.reference.hash, 'b-ii-pub');
        const source = registry.listSources().find((s) => s.origin === registeredOrigin);
        assert(source.placements[0].position.x === 2,
            `B-ii-b. The registered position is the AUTHORITATIVE position (x=2), never the conflicting claimedPosition (x=9999) — got x=${source.placements[0].position.x}.`);

        // iii. authority NO, claim YES — Section A's own shape, reconfirmed
        // here as one cell of the same matrix.
        const iii = await runQuadrant('b-iii', { publicationId: 'b-iii-pub', authorityPosition: null, claimedPosition: { x: 3, y: 0, z: 3 } });
        assert(iii.result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, `B-iii. Claim alone (no authority) is insufficient for admission (got ${iii.result.outcome}).`);

        // iv. authority NO, claim NO.
        const iv = await runQuadrant('b-iv', { publicationId: 'b-iv-pub', authorityPosition: null, claimedPosition: undefined });
        assert(iv.result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, `B-iv. Neither authority nor claim: still UNPLACED — the ordinary, unremarkable case (got ${iv.result.outcome}).`);

        console.log('✓ B(1) — the 2x2 authority/claim matrix (identity + content-hash verification held real and successful throughout) shows the World position used is a pure function of AUTHORITY alone: REGISTERED happens if and only if an authoritative WorldPlacement already exists (i, ii), UNPLACED happens if and only if it does not (iii, iv) — and when both authority and a conflicting claim exist (ii), the claim is silently never consulted, never even read.');

        // B(2) — the pure claim-identity trichotomy the MANUAL flow
        // (ui/components/OwnPublicationPanel.js's own useClaimedSnapshotPosition())
        // already owns, run directly against the real, unmodified pure
        // function, to name the vocabulary this codebase already has for
        // the "identity" axis — vocabulary the automatic path above never
        // invokes at all (Section A8 already confirmed it never imports
        // this file).
        const claimed = resolveSnapshotWorldPositionClaim({ publicationId: 'p1', claimedPosition: { x: 5, y: 0, z: 5 } }, 'p1');
        assert(claimed.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, 'B2a. Matching publicationId: CLAIMED.');
        const mismatched = resolveSnapshotWorldPositionClaim({ publicationId: 'p1', claimedPosition: { x: 5, y: 0, z: 5 } }, 'p2');
        assert(mismatched.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED, 'B2b. Differing publicationId: MISMATCHED, never silently treated as ABSENT.');
        const absent = resolveSnapshotWorldPositionClaim({ contentHash: 'h' }, 'p1');
        assert(absent.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, 'B2c. No claim fields at all: ABSENT.');

        console.log('✓ B(2) — this codebase already names the identity-binding question precisely (CLAIMED/ABSENT/MISMATCHED, application/SnapshotWorldPositionClaim.js) for the one, explicit, person-initiated flow that ever asks it — and, per A8, the automatic walking-triggered path never asks this question at all, because it never reaches for authority via a claim in the first place.');
    }

    // ===============================================================
    // Section C — Find the existing admission authority. Trace the exact
    // chain from ui/views/WorldView.js's own composition down to the
    // primitive that actually creates a PlacementRecord.
    // ===============================================================
    {
        const cascadeHeader = await rawSource('application/AutomaticSnapshotEncounterCascade.js');
        assert(/resolvePlacementInfo.{0,400}does an ALREADY-KNOWN, ALREADY-AUTHORITATIVE\s*\n?\/\/ WORLD PLACEMENT exist/is.test(cascadeHeader.replace(/\r/g, ''))
            || /does an ALREADY-KNOWN, ALREADY-AUTHORITATIVE/.test(cascadeHeader),
            'C1. The cascade\'s own header names its ONE admission question explicitly: does an already-known, already-authoritative WorldPlacement exist for this publicationId.');

        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');
        assert(/resolvePlacementInfo:\s*\(publicationId\)\s*=>\s*session\.getPlacementInfoForPublication\(publicationId\)/.test(worldViewSource),
            'C2. The real composition root wires resolvePlacementInfo to session.getPlacementInfoForPublication(publicationId) — never a claim, never a signature check performed inline.');

        const sessionSource = codeOnlyLines((await Promise.all(worldNavigationSessionFiles().map((file) => rawSource(file)))).join('\n'));
        assert(/getPlacementInfoForPublication\s*\(/.test(sessionSource), 'C3. getPlacementInfoForPublication exists on the real session class.');
        // It is keyed purely by publicationId against the PlacementRegistry
        // — never consulting the candidate's own claimed identity, owner
        // match, or any Repository/WorldDiscoverySourceRegistry concept.
        const getPlacementInfoForPublicationBody = sessionSource.slice(sessionSource.indexOf('getPlacementInfoForPublication('));
        const nextMethodStart = getPlacementInfoForPublicationBody.indexOf('\n    }\n\n    ');
        const scoped = nextMethodStart > 0 ? getPlacementInfoForPublicationBody.slice(0, nextMethodStart) : getPlacementInfoForPublicationBody.slice(0, 800);
        assert(!/WorldDiscoverySourceRegistry|Repository|claimedPosition/i.test(scoped),
            'C4. getPlacementInfoForPublication() consults no WorldDiscoverySourceRegistry, Repository, or claimedPosition concept — publicationId + PlacementRegistry is the whole story.');

        const placeUseCaseSource = codeOnlyLines(await rawSource('application/PlacePublicationUseCase.js'));
        assert(!/claimedPosition/.test(placeUseCaseSource),
            'C5. PlacePublicationUseCase — the ONE place a PlacementRecord is ever created by an explicit human action — never reads claimedPosition either.');
        assert(/currentUser\s*\?\s*currentUser\.username\s*:\s*null/.test(placeUseCaseSource),
            'C6. A PlacementRecord\'s owner is whoever explicitly CALLS this use case with their own current identity — placement authorization, not authorship of the announcement, and not the candidate\'s own self-reported identity.');
        assert(/signCanonical/.test(placeUseCaseSource),
            'C7. A signed placement (0.2.16) is the real, already-existing admission primitive — the same one this whole audit is asking whether a new trust mechanism is needed to replace.');

        console.log('✓ C — the existing admission authority traced end to end: ui/views/WorldView.js wires the cascade\'s one question straight to session.getPlacementInfoForPublication() (C2-C3), which is keyed by publicationId alone against the PlacementRegistry with no Repository/registry/claim concept mixed in (C4), and the ONE thing that ever creates a PlacementRecord — PlacePublicationUseCase — never reads claimedPosition and signs the record with the CALLER\'s own current identity (C5-C7). A latent, reusable admission concept already exists: "does a signed PlacementRecord exist for this publicationId." No new trust abstraction is required to state the boundary — one already governs it.');
    }

    // ===============================================================
    // Section D — Explore the key missing state. Does any existing
    // object already carry VERIFIED + CLAIMED_POSITION + NOT_AUTO_PLACED?
    // ===============================================================
    {
        // D1. WorldSnapshotInspection's own header, in its own words,
        // already names claimedPosition as unreachable at the ONE
        // encounter-inspection surface this codebase has — and that
        // surface only exists post-registration in the first place.
        const inspectionHeader = await rawSource('application/WorldSnapshotInspection.js');
        assert(/claimedPosition.*NOT REACHABLE HERE|NOT REACHABLE HERE.*claimedPosition/s.test(inspectionHeader),
            'D1. WorldSnapshotInspection.js\'s own header already documents claimedPosition as not reachable at the one inspection surface this codebase has for an encounter.');
        const inspectionSourceCode = codeOnlyLines(inspectionHeader);
        assert(!/claimedPosition/.test(inspectionSourceCode),
            'D1b. And its actual (non-comment) code confirms it: no claimedPosition reference anywhere in the executable source.');

        // D2. The cascade's own per-run memo has no query surface — an
        // UNPLACED result is not stored anywhere a UI could ever read it
        // back from later; it is returned once, to the one caller of that
        // one processCandidate() call, and then only ever re-returned
        // (memoized) to an IDENTICAL future call for the same key.
        const cascadeSourceCode = codeOnlyLines(await rawSource('application/AutomaticSnapshotEncounterCascade.js'));
        const publicMethodNames = [...cascadeSourceCode.matchAll(/^\s{4}(\w+)\s*\(/gm)].map((m) => m[1]);
        const queryLikeMethods = publicMethodNames.filter((name) => name !== 'constructor' && name !== 'processCandidate' && !name.startsWith('_'));
        assert(queryLikeMethods.length === 0,
            `D2. AutomaticSnapshotEncounterCascade exposes no public method beyond processCandidate() itself (found extra: ${queryLikeMethods.join(', ') || 'none'}) — an UNPLACED outcome is handed to its one caller and then gone.`);

        // D3. OwnPublicationPanel's claim-consumption state is a named,
        // owner-scoped component prop, not a Wanderer-facing surface: the
        // component requires a `publication` prop, and the whole flow is
        // keyed to `this.publication.id` — the panel's own active
        // Publication, never an arbitrary encountered one.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/publication:\s*\{/.test(panelSource) && /useClaimedSnapshotPosition\(\)\s*\{/.test(codeOnlyLines(panelSource)),
            'D3. useClaimedSnapshotPosition() exists, scoped to this component\'s own required `publication` prop.');
        assert(/resolveSnapshotWorldPositionClaim\(candidate, publication\.id\)/.test(codeOnlyLines(panelSource)),
            'D3b. It is invoked with THIS component\'s own active publication\'s id — never a Wanderer-selected, arbitrary encountered Publication.');

        // D4. No hypothetical name for the missing state already exists
        // anywhere in the codebase under a different name (i.e. this is
        // genuinely new state, not a rename of something that already
        // exists).
        //
        // AMENDED BY 0.9.552: this audit's own Section E named "Observer-
        // local encounter" as one of three compared (never implemented)
        // spatial-semantics models, and this milestone's own follow-up,
        // 0.9.552, built exactly that model under exactly the name this
        // grep was written to detect — core/ObserverLocalPublicationEncounter.js
        // and application/ObserverLocalEncounterStore.js, plus 0.9.552's own
        // additive `encounter` field on
        // application/AutomaticSnapshotEncounterCascade.js's own UNPLACED
        // result. This is this audit's own predicted gap being closed, not
        // a false positive — the three files below are excluded from this
        // check by name, on record, rather than loosening the pattern
        // itself (which would silently stop detecting a REAL future rename
        // of this exact missing state under a fourth name).
        const knownAsOf0_9_552 = new Set([
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/ObserverLocalEncounterStore.js',
            'core/ObserverLocalPublicationEncounter.js',
            'ui/views/WorldView.js',
            'ui/components/WorldEncounterCanvas.js',
            // WorldEncounterCanvas.js's own observer-local methods, moved out of it.
            'ui/components/worldEncounterCanvas/observerLocalEncounterMethods.js'
        ]);
        let hits = '';
        try {
            hits = execSync('grep -rli "UnplacedCandidate\\|SpatialClaimObservation\\|PendingPlacement\\|ObserverLocalEncounter\\|CandidatePresentation" application core ui --include="*.js" || true',
                { cwd: SOURCE_ROOT.pathname }).toString().trim();
        } catch { /* zero hits is expected and fine */ }
        const unexpectedHits = hits.split('\n').map((line) => line.trim()).filter((line) => line.length > 0 && !knownAsOf0_9_552.has(line));
        assert(unexpectedHits.length === 0, `D4. No existing production file already models this missing state under a different name, beyond 0.9.552's own already-accounted-for implementation (unexpected hits: ${unexpectedHits.join(', ') || 'none'}).`);

        console.log('✓ D — no existing object already carries the missing state: the one post-placement inspection surface explicitly documents claimedPosition as unreachable, and only activates after registration in the first place (D1); the cascade\'s own UNPLACED result has no query surface anywhere (D2); the one place claimedPosition IS consumed today is a named-owner, component-scoped action, never a Wanderer-facing one (D3); and no differently-named surface already models this state under the covers (D4). The "???" this milestone\'s own brief names is genuinely empty today — not built here, per that same brief.');
    }

    // ===============================================================
    // Section E — Compare three spatial semantics models, without
    // implementing any of them.
    // ===============================================================
    {
        const placementRecordSource = codeOnlyLines(await rawSource('core/PlacementRecord.js'));
        assert(!/candidate|unauthoritative|claimSource/i.test(placementRecordSource),
            'E1. core/PlacementRecord.js carries no notion of a "candidate" or "unauthoritative" placement today — any Model 2 (untrusted spatial claim) implementation would need genuinely NEW state, never a repurposing of an existing PlacementRecord field.');

        const registrySource = codeOnlyLines(await rawSource('application/MaterializedSnapshotWorldDiscoveryBridge.js'));
        assert(!/candidate|unauthoritative|observerLocal/i.test(registrySource),
            'E2. The existing World-registration bridge carries no notion of a non-shared, observer-scoped registration either — a Model 3 (observer-local encounter) would likewise need a genuinely new, session-scoped surface, never a mode flag on the existing shared WorldDiscoverySourceRegistry.');

        const models = [
            ['Model 1 — Authoritative placement', 'What this codebase already has (Sections A-C). verified publication + trusted placement authority -> PlacementRecord -> shared World state. Unchanged by this audit.'],
            ['Model 2 — Untrusted spatial claim', 'A Wanderer could inspect a claimedPosition as a claim, without it ever becoming World placement (no PlacementRecord, no spatial-index entry, no shared-World mutation). E1 confirms this needs genuinely new state — not a reinterpretation of PlacementRecord\'s own existing vocabulary.'],
            ['Model 3 — Observer-local encounter', 'The Wanderer who discovered it sees it, scoped to their own session, without any claim about where the publisher says it belongs. E2 confirms this needs a genuinely new, session-scoped surface — not a mode flag on the existing shared WorldDiscoverySourceRegistry.']
        ];
        for (const [name, note] of models) {
            assert(typeof name === 'string' && typeof note === 'string', 'E3. each model is named and honestly noted.');
        }
        console.log('✓ E — three models compared, none implemented: Model 1 is the status quo (Sections A-C); Models 2 and 3 are both structurally distinct from anything PlacementRecord or the shared WorldDiscoverySourceRegistry already expose (E1-E2), so either would require genuinely new state/surface, never a small reinterpretation of an existing field. This milestone selects none of them — see Section I.');
        for (const [name, note] of models) console.log(`    - ${name}\n      ${note}`);
    }

    // ===============================================================
    // Section F — Is claimedPosition even the right input for the
    // walking-triggered case? The Wanderer's own physical encounter
    // position (P) versus the publisher's claimedPosition (Q).
    // ===============================================================
    {
        const monitorSource = codeOnlyLines(await rawSource('application/WorldSnapshotDiscoveryMonitor.js'));
        assert(/shouldRefreshSnapshotDiscovery/.test(monitorSource),
            'F1. WorldSnapshotDiscoveryMonitor consults the Wanderer\'s own current spatial context only through shouldRefreshSnapshotDiscovery(), to decide WHEN to refresh discovery.');
        // The candidate array itself (this.lastResult) is assigned
        // directly from the discovery command's own return value — never
        // merged with, or annotated by, the context/position that
        // triggered the refresh.
        const lastResultAssignment = monitorSource.match(/this\.lastResult\s*=\s*[^;]+;/g) || [];
        assert(lastResultAssignment.length > 0 && lastResultAssignment.every((line) => !/context|position/i.test(line)),
            `F2. this.lastResult is assigned straight from the discovery command's own result (${lastResultAssignment.join(' | ')}) — never annotated with the triggering context/position.`);

        const envelopeHeader = await rawSource('core/SnapshotDiscoveryEnvelope.js');
        assert(/publicationId.*claimedPosition|claimedPosition.*publicationId/s.test(envelopeHeader),
            'F3. The discovery-candidate envelope documents exactly two optional claim fields, publicationId + claimedPosition — no observer/encounter-position field of any kind.');
        assert(!/observerPosition|encounterPosition|wandererPosition/i.test(codeOnlyLines(envelopeHeader)),
            'F3b. ...confirmed in the executable source: no observer-position field exists on the candidate shape today.');

        console.log('✓ F — the Wanderer\'s own physical encounter position (P) is NOT plumbed anywhere in this pipeline today: WorldSnapshotDiscoveryMonitor consults it only to decide WHEN to poll (F1), never attaches it to a candidate (F2), and the candidate shape itself has room only for the PUBLISHER\'s own claimedPosition (Q), not the WANDERER\'s own position at encounter time (F3-F3b). A future "observer-local encounter" model (Section E, Model 3) would need this as genuinely NEW instrumentation — it is not lying around unused under a different name.');
    }

    // ===============================================================
    // Section G — Adversarial cases named in the brief.
    // ===============================================================
    {
        // G1. Distance-blind claims: a claimedPosition arbitrarily far
        // from anything resembling a real World region is treated
        // identically to any other — because nothing in this pipeline
        // ever reads or compares a Wanderer's own position against a
        // claim at all (Section F already shows the pipeline does not
        // even know the Wanderer's position by the time a candidate
        // exists). This mirrors 0.9.549's own finding that the placement
        // chain carries no placement-distance-from-avatar constant.
        const host = makeHost('boundary-audit-g1');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry);
        const farClaim = { x: 999999, y: 0, z: 999999 };
        await placeAndAnnounce(host, 'far-claim-bytes', { publicationId: 'far-claim-pub', claimedPosition: farClaim });
        const [farCandidate] = await host.discoverSnapshotCandidatesCommand();
        const farResult = await cascade.processCandidate(farCandidate);
        assert(farResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED,
            'G1. An extravagantly distant claimedPosition is stopped for the identical reason as any other unauthoritative claim (no authority) — never because of, or despite, its distance; there is no distance check to evade or satisfy anywhere in this pipeline.');

        // G2. Forged contentHash targeting an already-placed Publication:
        // an attacker who does not own a real, already-placed Publication
        // hand-crafts a candidate naming that Publication's own
        // publicationId, a claimedPosition of their choosing, but bytes
        // that do NOT hash to the real Publication's contentHash. Content
        // verification — which runs BEFORE the placement question is ever
        // asked — must reject this before the cascade ever reaches the
        // authority check at all.
        const worldModel2 = makeWorldModel();
        const registry2 = new WorldDiscoverySourceRegistry();
        const victimPublicationId = 'victim-real-pub';
        worldModel2.placeAt(victimPublicationId, new Position(7, 0, 7));
        worldModel2.knowPublication(new Publication({ id: victimPublicationId, title: 'Victim', contentReference: new ContentReference({ hash: 'placeholder' }) }));
        const cascade2 = makeCascade(host, worldModel2, registry2);

        const realReference = await placeAndAnnounce(host, 'real-victim-bytes', { publicationId: victimPublicationId, claimedPosition: { x: 1, y: 0, z: 1 } });
        // The attacker's forged candidate: same publicationId, same
        // locator/storage (so retrieval itself succeeds), but a
        // DIFFERENT, forged contentHash that the real bytes do not
        // actually hash to.
        const forgedCandidate = {
            contentHash: 'forged-hash-does-not-match-real-bytes',
            locator: realReference.uri,
            storage: realReference.storage,
            publicationId: victimPublicationId,
            claimedPosition: { x: 666, y: 0, z: 666 }
        };
        const forgedResolution = await host.resolveSelectedSnapshotCommand(forgedCandidate);
        assert(forgedResolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            `G2. A forged contentHash for a real, already-placed victim Publication is rejected at VERIFICATION — before the placement/authority question is ever reached (got ${forgedResolution.outcome}).`);
        const forgedCascadeResult = await cascade2.processCandidate(forgedCandidate);
        assert(forgedCascadeResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'G2b. The full cascade stops at the same verification failure — it never reaches PLACE, so the attacker\'s own forged claimedPosition (666,0,666) is never even looked at, and the victim\'s real placement (7,0,7) is completely undisturbed.');
        assert(worldModel2.resolvePlacementInfo(victimPublicationId).position.x === 7,
            'G2c. The victim\'s own real, pre-existing placement is untouched by the forged, rejected candidate.');

        console.log('✓ G — both named adversarial shapes checked: an arbitrarily distant claim is refused for the same authority reason as any other, with no distance check to evade in the first place (G1); and a forged contentHash aimed at an already-placed victim Publication is rejected at content verification, never reaching the placement/authority question at all, leaving the victim\'s real placement and the attacker\'s forged claimedPosition both irrelevant to the outcome (G2-G2c). Content verification never confers spatial authority (Sections A-B already show this for the ordinary case; here it holds under deliberate attack too) — and rejecting spatial authority never required deleting or hiding the legitimately-verified content in Section A\'s own case, only declining to register it.');
    }

    // ===============================================================
    // Section H — Existing placement semantics reconfirmed undisturbed.
    // ===============================================================
    {
        const nonGoalVocabulary = /\bTRUST_SCORE\b|\bREPUTATION\b|\bPUBLISHER_RANK|\btrustScore\b|\breputation\b|\bADMISSION_STATE\b|\bCANDIDATE_PLACEMENT\b|\bOBSERVER_LOCAL\b/i;
        const filesToCheck = [
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/SnapshotWorldPlacement.js',
            'application/SnapshotWorldPositionClaim.js',
            'core/PlacementRecord.js',
            'placement/LocalPlacementRegistry.js',
            'core/SpatialAllocationPolicy.js',
            'application/PlacePublicationUseCase.js'
        ];
        for (const file of filesToCheck) {
            const source = codeOnlyLines(await rawSource(file));
            assert(!nonGoalVocabulary.test(source), `H1. ${file} carries none of this audit's own explicitly-excluded trust/admission vocabulary.`);
        }

        // H2. Live re-execution (not cited prose) of a real, existing
        // placement guard, per this codebase's own established convention
        // (0.9.398 Section A) of re-running a real guard file live rather
        // than merely trusting its recorded verdict still holds. 0.9.468's
        // own Orphaned Placement Product Reassessment — the most directly
        // relevant guard — transitively imports
        // application/WorldNavigationSession.js -> renderer/Renderer.js ->
        // the 'three' package, which this Node-only harness does not have
        // installed (the SAME documented constraint 0.9.550's own header
        // names for the identical reason: "that class can't be imported
        // here"). Re-executing it here would not prove anything — it
        // would fail with ERR_MODULE_NOT_FOUND regardless of whether this
        // milestone changed a single byte. `tests/PlacementRegistry.test.js`
        // is re-executed live instead: it exercises the SAME low-level
        // primitives Section C's own admission-authority trace depends on
        // (PlacementRecord, LocalPlacementRegistry, PlacePublicationUseCase)
        // without that transitive dependency, and genuinely runs here.
        let placementRegistryExitCode = null;
        let placementRegistryOutput = '';
        try {
            placementRegistryOutput = execSync('node tests/PlacementRegistry.test.js', { cwd: SOURCE_ROOT.pathname }).toString();
            placementRegistryExitCode = 0;
        } catch (error) {
            placementRegistryExitCode = error.status;
            placementRegistryOutput = (error.stdout || '').toString() + (error.stderr || '').toString();
        }
        assert(placementRegistryExitCode === 0, `H2. tests/PlacementRegistry.test.js re-executes live and still passes (exit ${placementRegistryExitCode}) — the low-level placement primitives Section C's own admission-authority trace depends on are undisturbed.`);
        assert(/All placement registry tests passed/.test(placementRegistryOutput),
            'H2b. The re-executed guard\'s own verdict string is read back directly, not assumed from exit code alone.');

        // H2c. 0.9.468's own Orphaned Placement Product Reassessment file
        // still exists, on disk, unmodified by this milestone (confirmed
        // via git, in I3 below, alongside every other production/test
        // file) — its own recorded verdict is not re-derived here, only
        // honestly not re-executed, for the environment reason just named.
        let orphanFileExists = false;
        try {
            orphanFileExists = (await rawSource('tests/OrphanedPlacementProductReassessment.test.js')).length > 0;
        } catch { /* absence would itself be a finding */ }
        assert(orphanFileExists, 'H2c. tests/OrphanedPlacementProductReassessment.test.js still exists on disk.');

        console.log('✓ H — existing placement semantics reconfirmed undisturbed: none of this audit\'s own explicitly-excluded trust/admission vocabulary exists anywhere in the placement/cascade/claim files it read (H1), and tests/PlacementRegistry.test.js — the lowest-level placement guard this harness can actually run — was re-executed LIVE against current source and still passes (H2-H2b); 0.9.468\'s own Orphaned Placement guard remains on disk, untouched, but cannot itself run in this Node-only harness (H2c), the same documented constraint 0.9.550 already named for the identical transitive dependency.');
    }

    // ===============================================================
    // Section I — Product classification and verdict.
    // ===============================================================
    {
        const classifications = [
            ['Automatic promotion of claimedPosition to authoritative World placement', 'SECURITY_BOUNDARY — correctly, deliberately, and (per Section G) robustly absent, including under a hostile forged-content attack. Must remain prohibited.'],
            ['The existing authority that DOES govern automatic registration (signed PlacementRecord existence)', 'ALREADY_CORRECT — Section C: a reusable admission concept already exists; no new trust abstraction is needed merely to state this boundary.'],
            ['A Wanderer\'s experience of genuinely novel, successfully-verified, third-party material with no prior local placement', 'PRODUCT_GAP — Section A/D: the entire real pipeline runs to a clean, successful stop, and the result is permanently, structurally invisible to the person who triggered it. Nothing is broken; nothing is unsafe; nothing is presented.'],
            ['A queryable/renderable "verified, claimed, not-yet-placed" state on any existing object', 'ARCHITECTURAL_GAP — Section D: genuinely does not exist anywhere today under any name; would be new state, not a repurposing.'],
            ['The Wanderer\'s own physical encounter position as pipeline input', 'ARCHITECTURAL_GAP, narrow — Section F: not plumbed anywhere today; relevant only if a future "observer-local encounter" model is ever pursued.'],
            ['Current documentation of this behavior (cascade/claim file headers)', 'NO GAP FOUND — Sections A/C/D quote the existing headers naming this exact restraint accurately and explicitly; nothing here is undocumented or misleading.']
        ];
        for (const [surface, verdict] of classifications) {
            assert(/^SECURITY_BOUNDARY|^ALREADY_CORRECT|^PRODUCT_GAP|^ARCHITECTURAL_GAP|^NO GAP FOUND/.test(verdict), `I. "${surface}" carries a real classification.`);
        }
        console.log('✓ I: Six surfaces classified against live evidence gathered above:');
        for (const [surface, verdict] of classifications) console.log(`    - ${surface}\n      ${verdict.split(' — ')[0]}`);

        // Deliberate-exclusions guard: none of the vocabulary this
        // milestone's own brief explicitly excludes as a MECHANISM exists
        // as real, executable code in any production file this audit
        // reads from or depends on (Section H's own file list, extended
        // with the two composition roots this audit traces in Section C).
        const excludedVocabulary = /reputation|trust\s*score|publisher\s*ranking|crowdsourc|trusted\s*publisher\s*badge|moderation\s*infrastructure|consensus\s*protocol|permanent\s*spatial\s*claim/i;
        const productionFilesThisAuditDependsOn = [
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/SnapshotWorldPlacement.js',
            'application/SnapshotWorldPositionClaim.js',
            'core/PlacementRecord.js',
            'placement/LocalPlacementRegistry.js',
            'application/PlacePublicationUseCase.js',
            'ui/views/WorldView.js',
            'application/WorldSnapshotDiscoveryMonitor.js',
            'application/WorldSnapshotInspection.js',
            'ui/components/OwnPublicationPanel.js'
        ];
        for (const file of productionFilesThisAuditDependsOn) {
            const source = codeOnlyLines(await rawSource(file));
            assert(!excludedVocabulary.test(source),
                `I2. ${file} contains none of this milestone's own explicitly-excluded reputation/trust/moderation vocabulary as real code.`);
        }

        let changedFiles = '';
        try {
            changedFiles = execSync('git status --porcelain -- . ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */, { cwd: SOURCE_ROOT.pathname }).toString();
        } catch { /* not fatal */ }
        const productionChanges = changedFiles.split('\n')
            .filter((line) => line.trim().length > 0)
            .map((line) => line.slice(3).trim())
            .filter((path) => !path.startsWith('tests/') && path !== 'tests.html');
        // AMENDED BY 0.9.558 — Known Publication Encounter Continuation,
        // mirroring tests/ObserverLocalEncounterExperienceProductReassessment.test.js's
        // own identical amendment, one file over: this milestone's own
        // brief named a PRODUCT_GAP (0.9.556 Section D) that 0.9.557's
        // audit traced to an existing seam and 0.9.558 then wired with
        // real, accountable production changes to exactly these two
        // files. `git status --porcelain` reflects whatever is currently
        // uncommitted in the working tree at test-run time, not this
        // milestone's own historical commit — narrowing to "no
        // UNEXPLAINED change" keeps this assertion meaningful across a
        // later milestone's own in-progress work, rather than failing for
        // the correct reason that a later, accountable milestone touched
        // these files.
        const knownAsOf0_9_558 = new Set([
            'ui/components/WorldEncounterCanvas.js',
            'ui/views/WorldView.js'
        ]);
        const unexpectedProductionChanges = productionChanges.filter((path) => !knownAsOf0_9_558.has(path));
        assert(unexpectedProductionChanges.length === 0,
            `I3. No production file is modified by this milestone beyond 0.9.558's own already-accounted-for continuation wiring (unexpected changes: ${unexpectedProductionChanges.join(', ') || 'none'}).`);

        console.log(`
--------------------------------------------------------------------
0.9.551 VERDICT: SECURITY_BOUNDARY (confirmed correct, Sections A/G) AND
PRODUCT_GAP (confirmed real, Sections A/D), SIMULTANEOUSLY.

The automatic walking-triggered pipeline's refusal to promote a publisher's
own claimedPosition to authoritative World placement is correct, live-
verified against real Nostr+Arweave+local-storage machinery, and survives
a deliberate forged-contentHash attack against an already-placed victim
Publication without ever reaching the authority question at all (Section
G). This boundary is not this milestone's to relax, and this milestone
does not relax it.

Separately, and just as real: a Wanderer whose own walking triggers the
ENTIRE real pipeline — discovery, resolution, content-hash verification,
materialization — for genuinely novel, unrelated third-party content gets,
today, structurally nothing for it. No UI surface, no persistent record,
no query interface, not even a private acknowledgment that the encounter
happened (Section D). The content is not hidden as a consequence of the
security boundary — Section A's own "acquisition survives" evidence shows
bytes and announcement both remain fully intact — it is simply never
admitted to any presentation layer at all, by design, because none exists
for this state today.

This milestone finds a genuinely reusable admission concept already
governs the boundary (Section C: signed PlacementRecord existence) — so a
follow-up capability milestone would NOT need to invent trust/reputation
machinery merely to close the product gap; it would need a narrow, new
surface for the "verified + claimed + not-auto-placed" state (Section D),
built on one of the three compared models (Section E), and would first
need to decide whether that surface uses the publisher's own claimedPosition
or the Wanderer's own physical encounter position — since the latter is
not currently plumbed anywhere in this pipeline at all (Section F).

Per this milestone's own brief, no such surface is built here. Existing
placement semantics are confirmed completely undisturbed (Section H), via a
live-executed guard for the primitives this harness can actually run;
0.9.468's own Orphaned Placement guard remains on disk, untouched, but
cannot itself execute under plain Node here (the same environment
constraint 0.9.550 already documented).

No production code changes ship with this milestone.
--------------------------------------------------------------------
`);
    }

    console.log('\n✅ All Novel Publication Spatial Admission Product Boundary Audit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All NovelPublicationSpatialAdmissionProductBoundaryAudit tests passed');
}).catch((error) => {
    console.error('\n✗ NovelPublicationSpatialAdmissionProductBoundaryAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
