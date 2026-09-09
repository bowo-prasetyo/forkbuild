import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { buildPlaceNamingClaimPublication } from '../application/PlaceNamingClaimPublication.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.315 — Place Naming Distribution Gap Audit.
//
// 0.9.313/0.9.314 closed the 0.9.x product-evolution loop at
// STABLE_WITH_DEFERRED_GAPS and locked a standing rule: the loop reopens
// only when something EXTERNAL supplies one of five named evidence kinds
// (0.9.314 Section F) — never on renewed architectural interest. This
// milestone exists because a product-direction conversation, after the
// 0.9.314 close, named a candidate crossing that exact bar: a Wanderer
// publishes a Place Naming claim on one device, expecting it to become
// discoverable to a second device through this codebase's own existing
// decentralized discovery path, and it never does — the claim never
// leaves local storage by any automatic means.
//
// That observation is NOT run at face value here. It could just as
// easily be a rediscovery of a fact this codebase's own record already
// carries — Place Naming's Nostr integration has been reconfirmed
// "read-only" three times before (0.9.254's own header, which already
// named and deliberately deferred a
// "future `NostrPlaceNamingDiscoveryPublisher`... unscheduled write-side
// counterpart"; 0.9.265 Section G; 0.9.271 Section G1) — which would make
// this exactly the "renewed architectural interest" 0.9.314 Section F
// defaults closed on, not new evidence at all. This milestone is a
// **test-only audit**, adapted from that product-direction conversation's
// own proposed structure, whose entire job is answering ONE question with
// live proof rather than restating the prior record: is there a genuine,
// demonstrable, currently-uncompletable WORKFLOW here, or only a
// previously-catalogued architectural fact wearing new language? It adds
// **no new capability** and makes **no production-code changes**.
//
//   Section A — Naming claim lifecycle inventory: the local-publish path
//               and the Nostr-discovery path traced and proven
//               structurally independent.
//   Section B — Publishing authority: the one semantic producer of a
//               naming claim identified, live.
//   Section C — Network-write absence: a grep sweep of the ENTIRE Place
//               Naming family (not merely the one file 0.9.271 Section G1
//               already checked) for any relay-write vocabulary, plus
//               confirmation no `NostrPlaceNamingDiscoveryPublisher`
//               class exists anywhere in this codebase, unlike its
//               Snapshot-discovery sibling.
//   Section D — Existing decentralized discovery contract: whether the
//               wire shape discovery already established is sufficient to
//               construct a publication, live round-tripped, plus proof
//               `buildPlaceNamingDiscoveryEnvelope()` — built for exactly
//               this purpose at 0.9.253 — has zero production callers
//               today.
//   Section E — Local vs. decentralized identity: five identity concepts
//               proven to stay distinct, so "saved locally" is never
//               conflated with "published."
//   Section F — FLAGSHIP: the cross-device journey, live, against a
//               shared fake relay standing in for "everything actually on
//               Nostr" — proving self-publish never reaches it, and that
//               manual export/import is the one channel that actually
//               moves a claim between two independent replicas today.
//   Section G — Export boundary classification: manual file exchange
//               confirmed as this codebase's own deliberately-designed
//               CURRENT sharing mechanism (0.5.3), live-wired to the UI,
//               never merely an incidental backup format.
//   Section H — Candidate substrate: Nostr confirmed the correct
//               announcement/discovery role, and the exact sibling
//               precedent (`NostrSnapshotDiscoveryPublisher.js`) a future
//               counterpart would mirror.
//   Section I — Failure/acknowledgement semantics: what a mirrored
//               publisher's own contract would and would not need to
//               introduce, read from the sibling's own real contract.
//   Section J — Reconciliation with 0.9.254/0.9.265/0.9.271/0.9.314's own
//               classifiers, and the final verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

// The same "grep-verifiable, never trust a header comment" discipline
// every prior reassessment already holds (0.9.219 onward, most recently
// 0.9.313/0.9.314).
async function grepCountInCode(pattern, files) {
    let count = 0;
    for (const file of files) {
        const code = codeOnlyLines(await rawSource(file));
        if (new RegExp(pattern).test(code)) count += 1;
    }
    return count;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    provider.identityId = identity.identityId;
    return provider;
}

// A full, real Place Naming collaborator graph BELOW the World/session
// layer — identical in shape to 0.9.265's/0.9.271's own makeReplica().
function makeReplica(identityProvider, { storage = new InMemoryStorageProvider() } = {}) {
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return { storage, store, log, verifier, exchange, useCase };
}

async function runTests() {
    console.log('Running Place Naming Distribution Gap Audit tests...\n');

    // ===============================================================
    // Section A — Naming claim lifecycle inventory. Trace the real
    // local-publish path and the real Nostr-discovery path from their own
    // source, and confirm structurally that neither one imports the
    // other's own machinery.
    // ===============================================================
    {
        const useCaseSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(useCaseSource.includes('this._store.save(claim)'),
            'A1. PlaceNamingClaimUseCase#publish() still ends its own write with a single call to the local store\'s save() — the entire persistence side effect of publishing.');
        assert(!/Nostr|relay|WebSocket|fetch\(/i.test(useCaseSource),
            'A2. PlaceNamingClaimUseCase.js — the local-publish path — imports and mentions nothing Nostr/relay/network-shaped anywhere in its own code.');

        const sourceSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoverySource.js'));
        assert(!/LocalPlaceNamingClaimStore|PlaceNamingClaimUseCase|PlaceNamingClaimExchange/.test(sourceSource),
            'A3. NostrPlaceNamingDiscoverySource.js — the decentralized-discovery path — imports nothing from the local-publish/store/exchange family; it only ever reads a relay.');

        // Live: publishing locally and discovering via Nostr are two
        // completely independent object graphs sharing no collaborator.
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-1', 'region-1', 'Riverbend');
        assert(claim instanceof PlaceNamingClaim && replica.store.has('world-1', claim.id) === true,
            'A4. publish() still signs, stores, and returns a real, persisted PlaceNamingClaim.');
        const discoverySource = new NostrPlaceNamingDiscoverySource({ queryImpl: async () => [] });
        assert(typeof discoverySource.search === 'function' && discoverySource.relayUrl.startsWith('wss://'),
            'A5. A Nostr discovery source can be constructed with zero dependency on anything publish() above produced — the two lifecycles never share an object.');

        console.log('✓ A: the local-publish lifecycle (sign -> verify -> store.save()) and the Nostr-discovery lifecycle (relay query -> parse -> aggregate) are reconfirmed structurally independent — neither file imports the other\'s own machinery, and each can be exercised live with zero reference to the other.');
    }

    // ===============================================================
    // Section B — Publishing authority. The one semantic producer of a
    // PlaceNamingClaim, identified and confirmed to have exactly one
    // production caller path into it.
    // ===============================================================
    {
        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        const publishIdx = sessionSource.indexOf('publishPlaceNamingClaim(regionId, name) {');
        const publishBody = sessionSource.slice(publishIdx, publishIdx + 400);
        assert(publishIdx > -1 && publishBody.includes('return this._placeNamingClaimUseCase.publish('),
            'B1. WorldNavigationSession\'s own publish entry point still forwards, and forwards ONLY, to PlaceNamingClaimUseCase#publish() — the session invents no second producer of its own.');

        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panelSource.includes("'publish-name'") && panelSource.includes('onPublish'),
            'B2. The one UI surface that lets a Wanderer author a claim (PlaceNamingPanel) still emits publish-name into the host, never constructs a PlaceNamingClaim or calls a store itself.');

        const constructionSites = grepFiles('new PlaceNamingClaim(', ['application', 'ui', 'identity', 'core'])
            .filter((f) => f !== 'core/PlaceNamingClaim.js');
        assert(constructionSites.length === 1 && constructionSites[0] === 'application/PlaceNamingClaimUseCase.js',
            `B3. Across the whole production codebase, "new PlaceNamingClaim(" appears in exactly one file — application/PlaceNamingClaimUseCase.js#publish() — the ONE real producer (found: ${constructionSites.join(', ') || 'none'}). The other consumer of the class, PlaceNamingClaimExchange#importClaim(), deliberately rehydrates an EXISTING claim via PlaceNamingClaim.fromJSON() instead — it never authors a new one, exactly the "distributes claims; never establishes truth" boundary that file's own header states.`);

        console.log('✓ B: PlaceNamingClaimUseCase#publish() is confirmed as the one semantic producer of a locally-authored naming claim, reached through exactly one UI door (PlaceNamingPanel -> WorldNavigationSession#publishPlaceNamingClaim() -> publish()) — there is no second, parallel producer anywhere in this codebase to route a future network write through instead of this one.');
    }

    // ===============================================================
    // Section C — Network-write absence. Extends 0.9.271 Section G1's own
    // single-file check (NostrPlaceNamingDiscoverySource.js only) to every
    // file in the Place Naming family, and confirms no write-side
    // publisher class exists anywhere in this codebase for this domain —
    // unlike its own Snapshot-discovery sibling, which has one.
    // ===============================================================
    {
        const PLACE_NAMING_FAMILY = [
            'core/PlaceNamingClaim.js', 'core/PlaceNamingDiscoveryEnvelope.js', 'core/PlaceNamingProximitySelection.js',
            'core/PlaceNamingView.js', 'application/PlaceNamingClaimExchange.js', 'application/PlaceNamingClaimPublication.js',
            'application/PlaceNamingClaimPublicationKind.js', 'application/PlaceNamingClaimPublicationValidator.js',
            'application/PlaceNamingClaimUseCase.js', 'application/PlaceNamingDiscoveryMonitor.js',
            'application/PlaceNamingDiscoveryQueryService.js', 'application/PlaceNamingDiscoveryRuntimeComposition.js',
            'application/NostrPlaceNamingDiscoverySource.js', 'application/LocalPlaceNamingPublicationLog.js',
            'application/LocalPlaceNamingClaimStore.js', 'application/DiscoverPlaceNamingClaimsCommand.js'
        ];
        for (const path of PLACE_NAMING_FAMILY) {
            assert(await sourceExists(path), `C1. ${path} still exists — the family this sweep covers is the real, current one, not a stale list.`);
        }

        const WRITE_VOCABULARY = ['publishImpl', 'relayUrl\\s*=.*publish', 'NostrInjectedProviderPublisher', 'WebSocket', "\\.send\\(", 'signEvent'];
        const violations = [];
        for (const path of PLACE_NAMING_FAMILY) {
            const code = codeOnlyLines(await rawSource(path));
            for (const pattern of WRITE_VOCABULARY) {
                if (new RegExp(pattern).test(code)) violations.push(`${path} (${pattern})`);
            }
        }
        assert(violations.length === 0,
            `C2. Zero relay-write vocabulary anywhere across all ${PLACE_NAMING_FAMILY.length} Place Naming family files' own CODE (comments excluded) — not merely the one file 0.9.271 Section G1 checked (violations: ${violations.join('; ') || 'none'}).`);

        assert(await sourceExists('application/NostrSnapshotDiscoveryPublisher.js') === true,
            'C3. The sibling domain (Snapshot discovery) DOES have a real Nostr write-side publisher class — confirming a write-side counterpart is an established, precedented shape in this codebase, not a novel idea.');
        // UPDATED AT 0.9.316 — a historical fact, not a live gap check.
        // At the time this audit ran, no corresponding class existed
        // anywhere in this codebase for Place Naming — exactly the file
        // 0.9.254's own header named and explicitly deferred as "a
        // separate, unscheduled" milestone. 0.9.316 (Place Naming Claim
        // Publication Boundary) has SINCE built exactly this class,
        // mirroring its Snapshot-discovery sibling per this audit's own
        // Section H/J recommendation. This assertion is intentionally
        // flipped, in place, rather than deleted — the same "update the
        // prior record rather than pretend it never made the claim"
        // discipline this codebase already holds for a milestone that
        // closes a gap a numerically earlier one identified.
        assert(await sourceExists('application/NostrPlaceNamingDiscoveryPublisher.js') === true,
            'C4. 0.9.316 has since built application/NostrPlaceNamingDiscoveryPublisher.js — the write-side counterpart 0.9.254\'s own header named and deferred, and this very audit (Section J) classified MISSING_DOMAIN_CAPABILITY, is no longer missing. See tests/PlaceNamingClaimPublication.test.js for 0.9.316\'s own proof.');

        console.log('✓ C: extended past 0.9.271 Section G1\'s own single-file check, zero relay-write vocabulary exists anywhere across the full 16-file Place Naming family (0.9.316\'s own new publisher file is deliberately outside this 16-file list, and carries its own regression coverage instead). A NostrPlaceNamingDiscoveryPublisher class did not exist at the time of this audit — 0.9.316 has since built it, closing exactly the gap this section documented.');
    }

    // ===============================================================
    // Section D — Existing decentralized discovery contract. Whether the
    // wire shape discovery already established already carries enough to
    // construct a publication — and whether the one function built for
    // exactly that purpose has ever actually been called in production.
    // ===============================================================
    {
        const envelopeSource = await rawSource('core/PlaceNamingDiscoveryEnvelope.js');
        assert(envelopeSource.includes('the plain-object shape a future publishing source hands to a transport'),
            'D1. core/PlaceNamingDiscoveryEnvelope.js\'s own header still names buildPlaceNamingDiscoveryEnvelope() as built specifically for a future publishing source — this is not this audit inventing a role for it.');

        // Live: build a real signed claim, put it through the exact
        // builder a publisher would call, and confirm the result round
        // trips through the exact parser discovery already relies on —
        // the wire contract a write side would need already exists,
        // unmodified, today.
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-1', 'region-1', 'Riverbend');
        const built = buildPlaceNamingDiscoveryEnvelope(claim);
        const roundTripped = parsePlaceNamingDiscoveryEnvelope(JSON.stringify(built));
        assert(roundTripped && roundTripped.claim.id === claim.id && roundTripped.claim.name === 'Riverbend',
            'D2. buildPlaceNamingDiscoveryEnvelope(claim) already produces exactly the wire shape parsePlaceNamingDiscoveryEnvelope() (the same function every discovery source\'s own result is already parsed through) accepts back — a would-be publisher needs to invent no new wire format.');
        const tag = derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId);
        assert(tag === `forkbuild-place-naming:${claim.worldId}:${claim.regionId}`,
            'D3. derivePlaceNamingDiscoveryTag() already derives the identical routing tag a publisher and a query source would both need to agree on, unchanged since 0.9.253.');

        // UPDATED AT 0.9.316 — at the time this audit ran,
        // buildPlaceNamingDiscoveryEnvelope() had zero production
        // callers, built ahead of need and never wired to anything. 0.9.316
        // added its own one production caller — application/
        // NostrPlaceNamingDiscoveryPublisher.js — exactly the "missing
        // piece is the transport call, not the wire format" this section's
        // own original close already predicted.
        const productionHits = grepFiles('buildPlaceNamingDiscoveryEnvelope', ['application', 'ui', 'server', 'identity', 'core'])
            .filter((f) => f !== 'core/PlaceNamingDiscoveryEnvelope.js');
        assert(productionHits.length === 1 && productionHits[0] === 'application/NostrPlaceNamingDiscoveryPublisher.js',
            `D4. buildPlaceNamingDiscoveryEnvelope() now has exactly one production call site — application/NostrPlaceNamingDiscoveryPublisher.js, built at 0.9.316 (found: ${productionHits.join(', ') || 'none'}). At the time of this audit it had zero; the wire format itself needed no change to gain its first real caller.`);

        console.log('✓ D: the wire contract a Place Naming publisher would need already existed in full at the time of this audit — buildPlaceNamingDiscoveryEnvelope()/derivePlaceNamingDiscoveryTag(), built at 0.9.253 explicitly for this role, proven live to round-trip through the exact parser discovery already uses. 0.9.316 has since given it its first production caller, exactly as this section predicted, with no change to the wire format itself.');
    }

    // ===============================================================
    // Section E — Local vs. decentralized identity. Five distinct
    // concepts, proven never conflated: local claim identity, claim
    // content, publisher/author identity, discovery origin, and (would-be)
    // Nostr event identity.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-1', 'region-1', 'Riverbend');

        // Local claim identity (claim.id) is independent of content — the
        // same author can republish the same name under a new id.
        const claim2 = replica.useCase.publish('world-1', 'region-1', 'Riverbend');
        assert(claim.id !== claim2.id && claim.name === claim2.name,
            'E1. Claim identity (id) and claim content (name) are independent — two distinct claims can carry identical content, exactly as core/PlaceNamingClaim.js\'s own header documents.');

        // Publisher identity (authorIdentityId) is never the same
        // namespace as a storage-save event or a discovery origin.
        assert(claim.authorIdentityId === alice.identityId,
            'E2. Publisher identity is the signer\'s own identity id, structurally unrelated to where or how the claim happens to be stored.');

        // "Saved locally" is never "published to the network" — saving
        // never produces or requires any network-facing identity at all.
        assert(replica.store.has('world-1', claim.id) === true,
            'E3. The claim is fully, correctly persisted...');
        const anyNetworkIdentity = Object.keys(claim.toJSON()).some((key) => /relay|event|nostr/i.test(key));
        assert(anyNetworkIdentity === false,
            'E4. ...yet PlaceNamingClaim#toJSON() carries no relay id, no Nostr event id, and no discovery-origin field of any kind — local persistence never manufactures a network identity, because none has ever been assigned.');

        // Discovery origin is a property of an ENVELOPE from a SOURCE,
        // never a property of the claim itself.
        const envelope = parsePlaceNamingDiscoveryEnvelope(JSON.stringify(buildPlaceNamingDiscoveryEnvelope(claim)));
        assert(!('relayUrl' in envelope) && !('sourceId' in envelope),
            'E5. core/PlaceNamingDiscoveryEnvelope.js\'s own envelope shape carries no discovery-origin field either — which relay (if any) a claim was ever seen on is a fact a QUERY SOURCE would have to track separately, never a fact the claim or its envelope carries about itself.');

        console.log('✓ E: local claim identity, claim content, publisher identity, and would-be discovery/network identity are proven live to stay structurally distinct at every layer — "this claim was saved" never becomes, and never could silently become, "this claim was published," because no code path anywhere assigns a network-facing identity as a side effect of a local save.');
    }

    // ===============================================================
    // Section F — FLAGSHIP. The cross-device journey, live, against a
    // shared fake relay standing in for "everything actually on Nostr."
    // Proves self-publish never reaches it, and that manual export/import
    // is the one channel that actually moves a claim between two
    // independent replicas today.
    // ===============================================================
    {
        // `relayEvents` stands in for the ENTIRE Nostr network as seen by
        // this test — anything anyone has ever actually published. Both
        // "devices" below share this one array as their only common
        // ground; nothing else connects them.
        const relayEvents = [];
        function fakeQueryImpl(relayUrl, filter) {
            const wantedTags = filter['#t'] || [];
            return Promise.resolve(relayEvents.filter((event) => event.tags.some((t) => t[0] === 't' && wantedTags.includes(t[1]))));
        }

        const alice = makeIdentity('Alice');       // Device A
        const bob = makeIdentity('Bob');            // Device B — a fresh, independent replica, sharing NO storage with Alice.
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const worldId = 'world-shared';
        const regionId = 'region-shared';
        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);

        const bobsDiscoverySource = new NostrPlaceNamingDiscoverySource({ queryImpl: fakeQueryImpl });
        const bobsQueryService = new PlaceNamingDiscoveryQueryService([bobsDiscoverySource]);

        // F1. Device A publishes a claim entirely locally — exactly what
        // PlaceNamingPanel's "Publish" button does today.
        const claim = deviceA.useCase.publish(worldId, regionId, 'Riverbend');
        assert(deviceA.store.has(worldId, claim.id) === true, 'F1. Device A\'s own local store now has the claim.');
        assert(relayEvents.length === 0,
            'F2. Publishing on Device A left the shared relay untouched — publish() never wrote anything anywhere Device B could ever see, confirmed live, not merely by reading source.');

        // F3. Device B, relying ONLY on the exact decentralized discovery
        // path this product already ships (NostrPlaceNamingDiscoverySource
        // -> PlaceNamingDiscoveryQueryService -> executeDiscoverPlaceNamingClaimsCommand,
        // the identical chain ui/main.js/ui/views/WorldView.js wire
        // together in the real app), searches for the exact region Alice
        // published to.
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: bobsQueryService });
        assert(Array.isArray(discovered) && discovered.length === 0,
            'F3. THE GAP, LIVE: Device B\'s decentralized discovery — the real, shipped, production discovery chain, unmodified — returns ZERO results for Alice\'s claim. No action available to Alice on Device A, through any door this product currently exposes (Publish, and nothing else), can ever change this outcome. This is not a slower path or a missing UI affordance; it is a workflow this product cannot complete today, by any means, other than the manual step proven next.');

        // F4. The read side is not broken — it is precisely as capable as
        // this codebase's own record already documents. If ANYTHING had
        // ever written to the relay, Device B would find it, immediately,
        // with zero code changes. Simulate the one thing this product
        // never does (an actual relay write) to prove the discovery half
        // of the pipe is not the limiting factor.
        relayEvents.push({
            kind: 1,
            tags: [['t', discoveryTag]],
            content: JSON.stringify(buildPlaceNamingDiscoveryEnvelope(claim))
        });
        const discoveredAfterExternalWrite = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: bobsQueryService });
        assert(discoveredAfterExternalWrite.length === 1 && discoveredAfterExternalWrite[0].claim.id === claim.id,
            'F4. Once (and only once) an event actually exists on the relay — written here by the TEST itself, standing in for a capability this product does not have — Device B\'s completely unmodified discovery path finds it correctly. The gap is exclusively on the write side; discovery, aggregation, and parsing already do their job.');

        // F5. The one channel that actually works between two independent
        // ForkBuild replicas today: manual export -> manual import,
        // exactly 0.5.3's own file-exchange transport, never touching
        // relayEvents at all.
        const pkg = deviceA.exchange.exportClaim(claim);
        const importResult = deviceB.exchange.importClaim(pkg);
        assert(importResult.isNew === true && deviceB.store.has(worldId, claim.id) === true,
            'F5. Manual export/import succeeds and is, today, the ONLY path proven in this section that actually moves a self-published claim from Device A to Device B — and it required an out-of-band step (a file, physically handed from one device/session to the other) that this test itself, not any ForkBuild code path, performed.');

        console.log('✓ F (FLAGSHIP): live, against a shared fake relay standing in for the entire Nostr network, self-publishing on Device A provably never reaches Device B through decentralized discovery (F1-F3) — not because discovery is broken (F4 proves the read side works the instant anything is actually on the relay) but because nothing in this product ever writes there. The one channel proven here to actually complete the cross-device journey is manual file export/import (F5), which requires a side channel this test had to perform itself, standing in for a human physically moving a file.');
    }

    // ===============================================================
    // Section G — Export boundary classification. Manual file exchange
    // confirmed as this codebase's own deliberately-designed CURRENT
    // sharing mechanism, not an incidental backup format nor a stopgap.
    // ===============================================================
    {
        const exchangeSource = await rawSource('application/PlaceNamingClaimExchange.js');
        assert(exchangeSource.includes("Alice's claim --export--> Publication --import--> Bob's claim store"),
            'G1. PlaceNamingClaimExchange.js\'s own header still states its purpose as exactly this cross-replica sharing diagram — export/import was designed AS the sharing mechanism, not discovered as a side effect of something else.');
        assert(/deliberately protocol-independent/i.test(exchangeSource),
            'G2. The same header confirms file exchange is explicitly the FIRST of several intended transports ("every future transport... plugs into THIS class\'s importClaim()/exportClaim()"), never presented as the only, permanent one.');

        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panelSource.includes('Names are published locally first — share a claim') && panelSource.includes('Import Claim'),
            'G3. The live UI (PlaceNamingPanel\'s own "Exchange" section) tells the user, in-product, that sharing IS exporting — this is documented, wired, user-facing product behavior today, not merely available machinery nobody surfaces.');

        const worldViewSource = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(/export-claim/.test(worldViewSource) && /import-claim/.test(worldViewSource),
            'G4. ui/views/WorldView.js still wires both the export-claim and import-claim events to real file-download/file-read handlers — live, reachable UI, unchanged since 0.5.3.');

        console.log('✓ G: manual file export/import is confirmed, from this codebase\'s own design record and its own live UI copy, to be the deliberately-designed CURRENT sharing mechanism for a Place Naming claim — not a backup format nor an accidental workaround. This strengthens, rather than weakens, Section F\'s finding: the product already commits to "sharing means exporting" as its stated position, while simultaneously offering a Nostr discovery surface that can never actually receive a ForkBuild user\'s own export without a THIRD, undocumented step.');
    }

    // ===============================================================
    // Section H — Candidate substrate. Nostr confirmed as the correct
    // announcement/discovery role (never generalized to a three-role
    // provider system), and the exact sibling precedent a mirrored
    // publisher would follow.
    // ===============================================================
    {
        // Content and Proof/Anchoring roles are irrelevant here — a
        // PlaceNamingClaim has no bytes to store or anchor separately
        // from itself (core/PlaceNamingDiscoveryEnvelope.js's own header,
        // "no locator/storage split to make"). Only the
        // Announcement/Discovery role is in scope, and Nostr is already
        // the substrate this codebase chose for exactly that role in this
        // domain — the ONLY discovery source it has ever shipped.
        const compositionSource = await rawSource('ui/main.js');
        assert(compositionSource.includes('NostrPlaceNamingDiscoverySource'),
            'H1. ui/main.js\'s own real composition root already wires Nostr, and only Nostr, as this domain\'s discovery substrate — this audit is not proposing a new provider, only asking whether the existing one\'s read side should gain a write side.');

        const snapshotPublisherSource = await rawSource('application/NostrSnapshotDiscoveryPublisher.js');
        assert(snapshotPublisherSource.includes('publishImpl') && snapshotPublisherSource.includes('discoveryTag'),
            'H2. The exact sibling precedent (NostrSnapshotDiscoveryPublisher, 0.9.133) takes an injected publishImpl and a discoveryTag, builds a { kind, tags, content } event template from an already-described envelope, and returns { published, relayUrl, id } | null — a well-precedented, already-proven shape a mirrored Place Naming counterpart would follow, not a novel design.');
        assert(snapshotPublisherSource.includes('never imports') || snapshotPublisherSource.includes('never opens a'),
            'H3. That sibling also documents, in its own header, that it never implements a concrete publishImpl itself — the identical injected-collaborator restraint this domain\'s own NostrPlaceNamingDiscoverySource#queryImpl already holds on the read side.');

        console.log('✓ H: Nostr is reconfirmed as the correct substrate for this specific role (announcement/discovery of a small, complete, already-signed JSON record) — no Arweave, no WebRTC, no provider-preference redesign is implicated. A well-precedented sibling class already demonstrates the exact shape a mirrored write-side counterpart would take, down to its injected-publishImpl contract.');
    }

    // ===============================================================
    // Section I — Failure/acknowledgement semantics. What a mirrored
    // publisher's own contract would and would not need to introduce.
    // ===============================================================
    {
        const snapshotPublisherSource = await rawSource('application/NostrSnapshotDiscoveryPublisher.js');
        assert(snapshotPublisherSource.includes('MALFORMED INPUT DEGRADES TO `null`'),
            'I1. The sibling\'s own contract already distinguishes exactly three outcomes — malformed candidate or a definite relay decline both degrade to null, a genuine transport/signing failure propagates as a rejection — with no PUBLISHED/CONFIRMED lifecycle, no retry policy, and no delivery-tracking state of any kind.');
        assert(snapshotPublisherSource.includes('A SIMPLE PUBLICATION RESULT, NEVER TRUST OR VERIFICATION SEMANTICS'),
            'I2. The sibling\'s own header is explicit that a successful publish() means only "the relay accepted this event" — never that it later confirms, never that anyone received it. A mirrored Place Naming counterpart inherits this same modest guarantee, not a stronger one.');

        console.log('✓ I: if a Place Naming write-side counterpart is ever built, its acknowledgement semantics are already fully specified by precedent — null | { published: true, relayUrl, id } | a rejected promise, exactly the sibling\'s own three outcomes, with local claim storage remaining unconditionally the source of truth regardless of whether a later publish attempt ever succeeds. No new domain state, delivery lifecycle, or retry machinery would need to be invented.');
    }

    // ===============================================================
    // Section J — Reconciliation with 0.9.254/0.9.265/0.9.271/0.9.314's
    // own record, and the final verdict.
    // ===============================================================
    {
        // Reuse 0.9.314's own classifier verbatim, rather than
        // re-deriving a competing one — the same discipline this whole
        // codebase already holds for reusing an established rule instead
        // of inventing a second, parallel copy of it.
        const VALID_NEW_PRODUCT_EVIDENCE = new Set([
            'newly-observed-blocked-user-journey',
            'newly-introduced-external-requirement',
            'concrete-workflow-cannot-currently-be-completed',
            'changed-product-constraint',
            'real-operational-problem-architecture-cannot-handle'
        ]);
        const INSUFFICIENT_REASONS = new Set([
            'there-is-an-unused-api',
            'we-could-combine-these-two-features',
            'another-provider-could-be-supported',
            'this-ui-could-show-more-information',
            'this-old-class-could-be-modernized',
            'this-architecture-could-be-generalized'
        ]);
        function opensNewImplementationMilestone(reasonCode) {
            if (VALID_NEW_PRODUCT_EVIDENCE.has(reasonCode)) return true;
            if (INSUFFICIENT_REASONS.has(reasonCode)) return false;
            return false;
        }

        // J1. Is this finding actually "another provider could be
        // supported" in disguise — the exact insufficient reason 0.9.314
        // Section F names by name? That reason describes ADOPTING a
        // substrate this domain does not already use (an Arweave source,
        // a WebRTC source). Section H1 above already proved, live against
        // ui/main.js's own real composition root, that Nostr is not a
        // candidate substrate here — it is the SOLE substrate this domain
        // has shipped since 0.9.254. This finding is "complete the write
        // half of the ONE substrate already chosen," a materially
        // different claim from "adopt a new one."
        const thisFindingIsAboutAnAlreadyChosenSubstrate = true; // established live in Section H1, reused here rather than re-argued.
        assert(INSUFFICIENT_REASONS.has('another-provider-could-be-supported') && thisFindingIsAboutAnAlreadyChosenSubstrate,
            'J1. "another-provider-could-be-supported" remains, correctly, in 0.9.314\'s own insufficient-reasons set — and this finding is confirmed distinct from it, since Section H1 already proved Nostr is the domain\'s existing substrate, not a proposed new one.');

        // J2. THE reconciling question this section exists to answer: was
        // Section F's finding already scored, as an actual CANDIDATE, by
        // any prior Place Naming reassessment? 0.9.271's own 13-row
        // capability/reachability matrix (tests/
        // PostAdoptionStatusPlaceNamingProductReassessment.test.js,
        // Section C) is this codebase's own most recent, most authoritative
        // record of exactly that kind of scoring for this domain.
        const priorMatrixSource = await rawSource('tests/PostAdoptionStatusPlaceNamingProductReassessment.test.js');
        const matrixRowNames = [...priorMatrixSource.matchAll(/matrix\.push\(\['([^']+)'/g)].map((m) => m[1]);
        assert(matrixRowNames.length === 13, 'J2a. 0.9.271\'s own matrix still has exactly the 13 rows its own file records.');
        const publishRowExists = matrixRowNames.some((name) => /publish|distribut|write/i.test(name));
        assert(publishRowExists === false,
            'J2b. None of 0.9.271\'s own 13 scored candidate rows names anything resembling a decentralized-publish/write-side capability — the read-only fact was reconfirmed in that same file\'s own Section G as BACKGROUND TEXT ("this codebase\'s only Nostr integration for Place Naming is query-only, reconfirmed fresh"), but it was never entered into the scored candidate matrix Section H actually verdicts against. This is the precise, narrow sense in which this audit\'s finding is genuinely new: not a new FACT, but the first time this specific fact has been run through this codebase\'s own product-gap evidence test as a live, demonstrated workflow (Section F above) rather than carried forward as prose.');

        // J3. Classify Section F's finding using 0.9.314's own gate.
        const reasonForThisFinding = 'concrete-workflow-cannot-currently-be-completed';
        assert(VALID_NEW_PRODUCT_EVIDENCE.has(reasonForThisFinding) && opensNewImplementationMilestone(reasonForThisFinding) === true,
            'J3. Section F demonstrated, live, an actual workflow ("Device B discovers Device A\'s self-published claim through this product\'s own decentralized discovery, with no manual step") that cannot currently be completed by any means this product exposes — 0.9.314\'s own gate classifies this reason as sufficient new evidence, reused unmodified rather than re-argued.');

        const CAPABILITY_TAXONOMY = ['COMPLETE', 'REACHABLE_BUT_INTERNAL', 'MISSING_UI', 'MISSING_DOMAIN_CAPABILITY', 'DEFERRED', 'OBSOLETE_CANDIDATE'];
        const verdictClassification = 'MISSING_DOMAIN_CAPABILITY';
        assert(CAPABILITY_TAXONOMY.includes(verdictClassification),
            'J4. The classification this audit assigns Section F\'s finding is drawn from the same six-value taxonomy 0.9.271 Section C already established for this exact domain, not a new vocabulary invented here.');

        console.log('✓ J: CLOSURE STATEMENT.\n' +
'\n' +
'FINDING: candidate #14 for the Place Naming domain — "decentralized (Nostr)\n' +
'publication of a self-authored PlaceNamingClaim" — classification\n' +
`${verdictClassification}, extending 0.9.271\'s own 13-row matrix by exactly one\n` +
'row never previously scored.\n' +
'\n' +
'WHY THIS IS GENUINELY NEW EVIDENCE, NOT A REDISCOVERY. The underlying FACT\n' +
'(Place Naming\'s Nostr integration reads but never writes) is not new — it was\n' +
'named at 0.9.254, reconfirmed at 0.9.265 Section G, and reconfirmed again at\n' +
'0.9.271 Section G1. What is new is Section F above: the first time this fact has\n' +
'been run through this codebase\'s own live, demonstrated-workflow standard\n' +
'(0.9.314 Section F\'s own evidence gate) rather than carried forward as\n' +
'background prose in a section that was never asked to verdict it. 0.9.271\'s own\n' +
'13-row matrix — its most authoritative scoring of this exact domain — never once\n' +
'named this candidate as a row (J2b). Rediscovering an OLD, already-scored,\n' +
'already-declined verdict would fail 0.9.314 Section F\'s gate by design; scoring a\n' +
'fact for the FIRST time, live, against a concrete two-device workflow that\n' +
'demonstrably cannot complete today, is exactly what that gate exists to let\n' +
'through.\n' +
'\n' +
'WHAT THIS MILESTONE DOES NOT DO. It does not build a publisher. It does not name\n' +
'the eventual feature "Nostr Naming." Per this milestone\'s own brief and this\n' +
'whole domain\'s own unbroken audit-before-build discipline (0.9.253 named its own\n' +
'future publisher and deferred it; 0.9.265/0.9.268/0.9.271 each named their own\n' +
'strongest candidate and built none of them), a demonstrated gap is a reason to\n' +
'SCORE a candidate precisely, not a license to build inside the same milestone\n' +
'that found it.\n' +
'\n' +
'THE NARROWLY-SCOPED SEAM, FOR A POSSIBLE FUTURE MILESTONE. Sections D/H/I above\n' +
'establish that the seam is unusually small and low-risk relative to most\n' +
'MISSING_DOMAIN_CAPABILITY findings in this codebase\'s own record: the wire\n' +
'format already exists and round-trips live (D), the substrate choice needs no\n' +
'debate (H — Nostr is already this domain\'s only discovery substrate), the exact\n' +
'class shape is already proven out by a sibling (H2), and the acknowledgement\n' +
'semantics introduce no new domain state (I). A future milestone considering this\n' +
'candidate would be deciding WHETHER to mirror\n' +
'NostrSnapshotDiscoveryPublisher.js for this domain, never designing a\n' +
'publication system from scratch.\n');
    }

    console.log('\n✅ All Place Naming Distribution Gap Audit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PlaceNamingDistributionGapAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PlaceNamingDistributionGapAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
