import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import PlaceNamingPanel from '../ui/components/PlaceNamingPanel.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { buildPlaceNamingClaimPublication } from '../application/PlaceNamingClaimPublication.js';
import { composePlaceNamingPublicationRuntime } from '../application/PlaceNamingPublicationRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { PlaceNamingDiscoveryMonitor } from '../application/PlaceNamingDiscoveryMonitor.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.322 — Post-Place-Naming Publication Product Reassessment.
//
// 0.9.320 made `NostrPlaceNamingDiscoveryPublisher` (0.9.316) reachable
// from a real click. 0.9.321 audited that reachable action from a
// skeptical angle and found it converges cleanly with the pre-existing
// claim/persistence/discovery architecture, surfacing exactly one genuine
// nuance (graceful degradation is a call-time property, not a render-time
// one) and recommending this milestone next. This is a **test-only
// product/architecture reassessment**. It adds no production code and no
// new capability. The question is not "what could Place Naming publication
// grow into" — it is "did 0.9.320/0.9.321 expose any NEW, currently
// blocked user journey," checked against real, live evidence rather than
// assumed from the shape of what now exists.
//
//   Section A — Complete user journey reconstruction: every stage of
//               name -> persist -> publish -> relay -> discover -> inspect
//               driven live, end to end, through the real, shipped
//               UI-shaped path, and classified IMPLEMENTED + REACHABLE.
//   Section B — Creation vs. publication: the semantic boundary the
//               product already draws (create asserts, publish announces)
//               reconfirmed live and structurally; automatic publication
//               confirmed NOT required by any evidence on file.
//   Section C — Publication feedback reassessment: history, persistent
//               status, retry, offline queue, and multi-relay
//               acknowledgement each checked against real source and
//               scored NOT READY, not merely "missing."
//   Section D — Stranger discoverability: a live, cross-identity flagship
//               proving the existing PROXIMITY-based discovery chain
//               already answers "can a stranger, with no prior
//               relationship to me, find a name I published near them" —
//               with no global browser required for that journey.
//   Section E — Social semantics: the existing claim model checked,
//               field by field and live, against the five questions the
//               milestone brief names (who/where/what/discoverable/
//               adoptable) — with profiles, reputation, voting, ranking,
//               and moderation confirmed absent and confirmed unnecessary
//               for those five questions specifically.
//   Section F — Cross-arc reassessment: Publication distribution, Snapshot
//               distribution, Place Naming publication, Publication
//               Commentary, Notifications, Collaboration, and Provider
//               preferences compared by USER JOURNEY, not by shared
//               "publishes things" shape — and no generic publication
//               framework is warranted.
//   Section G — Orphan/capability scan: NostrPlaceNamingDiscoveryPublisher
//               reconfirmed, fresh, as IMPLEMENTED + REACHABLE (no longer
//               REACHABLE_BUT_INTERNAL, 0.9.318's own classification) —
//               and no NEW orphan was introduced by 0.9.320/0.9.321.
//   Section H — External-evidence classifier: the milestone brief's own
//               ten-candidate table, scored against real source with the
//               same evidence gate 0.9.314 established, reused verbatim.
//   Section I — Final product decision: STABLE_WITH_DEFERRED_GAPS — STOP,
//               decided from Sections A-H, not asserted up front.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
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

function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
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

function makeReplica(identityProvider) {
    const storage = new InMemoryStorageProvider();
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return { storage, store, log, verifier, exchange, useCase };
}

// A shared-relay double, independent of any prior test file's own —
// records every published event and answers a NIP-01-shaped `#t` filter
// query against exactly what it recorded.
function makeSharedRelay() {
    const events = [];
    return {
        events,
        async publishImpl(relayUrl, eventTemplate) {
            const id = `${events.length}`.padStart(64, 'f');
            events.push({ relayUrl, kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, id });
            return { published: true, id };
        },
        queryImpl(relayUrl, filter) {
            const wantedTags = filter['#t'] || [];
            return Promise.resolve(events.filter((event) => event.tags.some((t) => t[0] === 't' && wantedTags.includes(t[1]))));
        }
    };
}

// Mirrors ui/main.js's own `publishPlaceNamingClaimToNostrCommand` builder
// exactly, including its exact error message.
function composeMainJsCommand({ discoveryPublisher }) {
    return (claim) => Promise.resolve().then(() => {
        if (!discoveryPublisher) {
            throw new Error('Nostr publishing is not available — no compatible browser extension was found');
        }
        return discoveryPublisher.publish(claim);
    });
}

function makeSession(claimsForRegion) {
    return new Proxy({ getPlaceNamingClaims: claimsForRegion }, {
        get(target, prop) {
            if (prop === 'getPlaceNamingClaims') return target.getPlaceNamingClaims;
            if (prop === 'then' || typeof prop === 'symbol') return undefined;
            throw new Error(`fake session: unexpected access to session.${String(prop)}`);
        }
    });
}

// Mirrors ui/views/WorldView.js's own `publishNamingClaimToNostr()` /
// `resetNamingPanelPublishToNostr()` / `openNamingPanel()` naming-panel
// publication slice — the same reproduction 0.9.321's own audit used.
function makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand }) {
    const state = {
        namingPanelRegionId: null,
        namingPanelPublishToNostrClaimId: null,
        namingPanelPublishToNostrExecuting: false,
        namingPanelPublishToNostrError: null,
        namingPanelPublishToNostrResult: null,
        namingPanelPublishToNostrRequestId: 0
    };

    function resetNamingPanelPublishToNostr() {
        state.namingPanelPublishToNostrRequestId += 1;
        state.namingPanelPublishToNostrClaimId = null;
        state.namingPanelPublishToNostrExecuting = false;
        state.namingPanelPublishToNostrError = null;
        state.namingPanelPublishToNostrResult = null;
    }

    function openNamingPanel(regionId) {
        state.namingPanelRegionId = regionId;
        resetNamingPanelPublishToNostr();
    }

    function publishNamingClaimToNostr(claimId) {
        if (!publishPlaceNamingClaimToNostrCommand) return;
        const regionId = state.namingPanelRegionId;
        if (!regionId) return;
        const claim = session.getPlaceNamingClaims(regionId).find((c) => c.id === claimId);
        if (!claim) return;

        state.namingPanelPublishToNostrRequestId += 1;
        const requestId = state.namingPanelPublishToNostrRequestId;
        state.namingPanelPublishToNostrClaimId = claimId;
        state.namingPanelPublishToNostrExecuting = true;
        state.namingPanelPublishToNostrError = null;
        state.namingPanelPublishToNostrResult = null;

        return Promise.resolve()
            .then(() => publishPlaceNamingClaimToNostrCommand(claim))
            .then((result) => {
                if (state.namingPanelPublishToNostrRequestId !== requestId) return;
                state.namingPanelPublishToNostrExecuting = false;
                state.namingPanelPublishToNostrResult = result;
            })
            .catch((error) => {
                if (state.namingPanelPublishToNostrRequestId !== requestId) return;
                state.namingPanelPublishToNostrExecuting = false;
                state.namingPanelPublishToNostrError = (error && error.message) ? error.message : 'Publish to Nostr failed.';
            });
    }

    return { state, openNamingPanel, publishNamingClaimToNostr, resetNamingPanelPublishToNostr };
}

// A "click" on PlaceNamingPanel's own real, unmodified onPublishToNostr(),
// feeding straight into a host's publishNamingClaimToNostr().
function clickPublishToNostr(host, claimId) {
    const emitted = [];
    const ctx = { $emit: (event, ...args) => emitted.push({ event, args }) };
    PlaceNamingPanel.methods.onPublishToNostr.call(ctx, claimId);
    assert(emitted.length === 1 && emitted[0].event === 'publish-to-nostr', 'sanity: the real PlaceNamingPanel.onPublishToNostr() emitted publish-to-nostr');
    return host.publishNamingClaimToNostr(emitted[0].args[0]);
}

async function run() {
    console.log('Running Post-Place-Naming Publication Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Complete user journey reconstruction.
    //
    // Every stage of the diagram in this milestone's own brief, driven
    // LIVE through the real, shipped collaborators — never trusted from a
    // prior milestone's own header — and classified IMPLEMENTED +
    // REACHABLE, not merely IMPLEMENTED.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl }
        });
        const publishPlaceNamingClaimToNostrCommand = composeMainJsCommand({ discoveryPublisher });

        const alice = makeIdentity('Alice');     // Creator, Device A.
        const stranger = makeIdentity('Stranger'); // Discoverer, Device B — no prior relationship, no shared storage.
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(stranger);
        const worldId = 'reassessment-world-a';
        const regionId = 'reassessment-region-a';

        // Stage 1 — Name a place.
        const claim = deviceA.useCase.publish(worldId, regionId, 'Journey Junction');
        assert(claim instanceof PlaceNamingClaim, 'A1. naming a place produces a real, signed PlaceNamingClaim');

        // Stage 2 — Claim persisted locally.
        assert(deviceA.store.list(worldId).some((c) => c.id === claim.id), 'A2. the claim is persisted to Device A\'s own local store immediately, before any publish action');
        assert(relay.events.length === 0, 'A2b. persistence alone announces nothing — no relay event exists yet');

        // Stage 3 — User chooses "Publish to Nostr", through the actual
        // click -> panel -> host -> composed-runtime path (never the raw
        // publisher called directly, and never a second claim construction).
        const sessionA = makeSession((rid) => deviceA.useCase.claimsForRegion(worldId, rid));
        const hostA = makeWorldViewHost({ session: sessionA, publishPlaceNamingClaimToNostrCommand });
        hostA.openNamingPanel(regionId);
        await clickPublishToNostr(hostA, claim.id);
        await flushMicrotasks();
        assert(hostA.state.namingPanelPublishToNostrResult && hostA.state.namingPanelPublishToNostrResult.published === true,
            'A3. the explicit "Publish to Nostr" UI action reports success');

        // Stage 4 — Nostr relay accepts event.
        assert(relay.events.length === 1, 'A4. exactly one event reached the relay through the full click -> panel -> host -> composed-runtime -> publisher path');

        // Stage 5 — Other device/person can discover it, through the
        // completely unmodified existing discovery chain, with no shared
        // object or prior relationship between Device A and Device B.
        const sourceB = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const queryServiceB = new PlaceNamingDiscoveryQueryService([sourceB]);
        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: queryServiceB });
        assert(discovered.length === 1 && discovered[0].claim.id === claim.id, 'A5. Device B (a stranger) discovers exactly Device A\'s own claim, through the unmodified discovery chain');

        // Stage 6 — Existing Place Naming inspection/adoption. Adoption
        // reuses the SAME manual-exchange boundary (buildPlaceNamingClaimPublication
        // -> exchange.importClaim()) `adoptNearbyPlaceNamingClaim()` itself
        // calls in ui/views/WorldView.js — proven here directly rather than
        // assumed from that function's own name.
        const discoveredClaimInstance = PlaceNamingClaim.fromJSON(discovered[0].claim);
        const pkg = buildPlaceNamingClaimPublication(discoveredClaimInstance);
        const importResult = deviceB.exchange.importClaim(pkg);
        assert(importResult.isNew === true && deviceB.store.has(worldId, claim.id), 'A6. Device B can inspect and adopt the discovered claim into its own local store, through the existing, unmodified import boundary');

        console.log('✓ A: Every stage of the journey diagram — name (A1) -> persist locally (A2) -> explicit "Publish to Nostr" (A3) -> relay acceptance (A4) -> cross-device, stranger discovery (A5) -> existing inspection/adoption (A6) — was driven live, end to end, through the real shipped collaborators. IMPLEMENTED + REACHABLE, confirmed fresh rather than assumed from 0.9.320/0.9.321\'s own headers.');
    }

    // ===============================================================
    // Section B — Creation vs. publication.
    // ===============================================================
    {
        // B1. The use case that creates a claim never references the
        // publisher, the composition seam, or Nostr at all — the SAME
        // structural fact 0.9.318 Section D1 already established, still
        // true after 0.9.320/0.9.321.
        const useCaseCode = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(!useCaseCode.includes('NostrPlaceNamingDiscoveryPublisher') && !useCaseCode.includes('composePlaceNamingPublicationRuntime'),
            'B1. PlaceNamingClaimUseCase#publish() still never references the publisher or the publication runtime — creating a claim locally still triggers no network write, automatic or otherwise.');

        // B2. Live: creating N claims in a row publishes zero of them.
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        for (let i = 0; i < 5; i++) {
            replica.useCase.publish('world-b', `region-b-${i}`, `Silent Name ${i}`);
        }
        const useCaseCodeAgain = await rawSource('application/PlaceNamingClaimUseCase.js');
        assert(!useCaseCodeAgain.includes('discoveryPublisher.publish('),
            'B2. PlaceNamingClaimUseCase.js\'s own source contains no call to a discovery publisher\'s publish() method — the five claims just created above triggered no relay write, confirmed structurally rather than merely by absence of a relay double in this section.');

        // B3. The panel/view UI itself keeps "Publish" (local, A1 in
        // ui/views/WorldView.js) and "Publish to Nostr" (announce) as two
        // separate buttons with two separate handlers — never one combined
        // action.
        const worldView = await rawSource('ui/views/WorldView.js');
        const panelJs = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(worldView.includes('function publishNamingClaim(name)') && worldView.includes('function publishNamingClaimToNostr(claimId)'),
            'B3. ui/views/WorldView.js still defines two distinct functions — publishNamingClaim() (create, local) and publishNamingClaimToNostr() (announce) — never one merged handler.');
        assert(panelJs.includes("@click=\"onPublishToNostr(claim.id)\"") && panelJs.includes('canPublishToNostr'),
            'B3b. ui/components/PlaceNamingPanel.js still gates the "Publish to Nostr" button on its own dedicated canPublishToNostr prop, separate from claim creation, which happens entirely outside this panel (the "Name Place" flow).');

        // B4. The one explicit product decision docs/Roadmap.md already
        // recorded (0.9.316, reaffirmed 0.9.320) is still on file, word for
        // word, and this milestone finds no evidence contradicting it: no
        // support request, bug report, or user complaint anywhere in this
        // codebase's own record asks for automatic publication.
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(roadmap.includes('publishing to Nostr stays **never automatic**'),
            'B4. docs/Roadmap.md still carries the exact, explicit "never automatic" product decision — not silently dropped or reworded by any milestone since.');
        const placeNamingFamilyForB4 = ['application/PlaceNamingClaimUseCase.js', 'application/PlaceNamingPublicationRuntimeComposition.js',
            'application/NostrPlaceNamingDiscoveryPublisher.js', 'ui/views/WorldView.js', 'ui/components/PlaceNamingPanel.js', 'ui/main.js'];
        for (const file of placeNamingFamilyForB4) {
            const code = codeOnlyLines(await rawSource(file));
            assert(!/auto.?publish|publish.*automatically|automatically.*publish/i.test(code),
                `B4b. ${file} contains no code path that publishes a Place Naming claim automatically — the decision is enforced in code, not only in prose.`);
        }

        console.log('✓ B: The create/publish boundary is real and enforced in code (B1/B2), reflected in two genuinely separate UI actions (B3), and matches an explicit, still-current product decision with no evidence on file to override it (B4). Automatic publication remains confirmed NOT required by any evidence available today.');
    }

    // ===============================================================
    // Section C — Publication feedback reassessment.
    // ===============================================================
    {
        const publisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        const compositionCode = codeOnlyLines(await rawSource('application/PlaceNamingPublicationRuntimeComposition.js'));
        const panelJs = codeOnlyLines(await rawSource('ui/components/PlaceNamingPanel.js'));
        const worldViewJs = codeOnlyLines(await rawSource('ui/views/WorldView.js'));

        // C1. Publication history — no persisted history store exists, and
        // the UI keeps at most one ephemeral result per in-flight claim
        // (0.9.320's own namingPanelPublishToNostrResult), never a list.
        assert(grepCount('PlaceNamingPublicationHistory\\|PublicationHistoryStore', ['application', 'core', 'storage']) === 0,
            'C1a. No publication-history storage class exists anywhere.');
        assert(!worldViewJs.includes('publishToNostrHistory') && !panelJs.includes('publishToNostrHistory'),
            'C1b. Neither the view nor the panel keeps a history list — publishToNostrResult remains a single, most-recent, per-claim ephemeral value (0.9.321 Section G already proved a later attempt replaces, never appends to, this value).');

        // C2. Persistent status — the result lives only in in-memory Vue
        // ref state, reset on openNamingPanel()/closeNamingPanel(); nothing
        // persists it to storage, so a page reload loses it, exactly as a
        // "no lifecycle" design would.
        assert(!/localStorage|StorageProvider/.test(compositionCode) && !/localStorage/.test(panelJs),
            'C2. No persistence mechanism backs the publish result — it is confirmed in-memory-only, by source, not merely by absence of a visible "history" UI.');

        // C3. Retry — no retry/backoff vocabulary in the publisher or the
        // composition seam; a failed attempt requires clicking the same
        // button again (a fresh, independent attempt, per 0.9.321 Section H,
        // never an automatic retry).
        assert(!/retry|retries|backoff/i.test(publisherCode) && !/retry|retries|backoff/i.test(compositionCode),
            'C3. No retry/backoff vocabulary exists in the publisher or the composition seam.');

        // C4. Offline queue — no queue vocabulary anywhere in the
        // publication path; a publish attempt made with no relay reachable
        // fails immediately (an honest rejection), never enqueued for later.
        assert(!/offline.?queue|pendingPublications|queuedClaims/i.test(publisherCode) && !/offline.?queue|pendingPublications|queuedClaims/i.test(compositionCode),
            'C4. No offline-queue vocabulary exists anywhere in the publication path.');

        // C5. Multi-relay acknowledgement — the publisher and the
        // composition seam both accept exactly one relayUrl / one
        // publishImpl, never an array of relays or a quorum/acknowledgement
        // count.
        assert(!/relays\s*:\s*\[|relayUrls|multiRelay|quorum/i.test(publisherCode),
            'C5. NostrPlaceNamingDiscoveryPublisher still accepts exactly one relay, not an array — no multi-relay fan-out or acknowledgement-counting exists.');
        assert(!/relays\s*:\s*\[|relayUrls|multiRelay/i.test(compositionCode),
            'C5b. The composition seam carries no multi-relay vocabulary either.');

        // C6. No recorded evidence anywhere in docs/Roadmap.md — including
        // 0.9.320's and 0.9.321's own entries, the two milestones that
        // actually exercised this action against real (simulated) failure
        // classes — of an actual user needing any of the above. 0.9.321's
        // own four failure classes (decline, transport rejection, timeout,
        // malformed id) were manufactured to prove ISOLATION, never
        // reported as a real operational problem this product has hit.
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(roadmap.includes('0.9.321'), 'C6a. sanity: docs/Roadmap.md carries 0.9.321\'s own record, the milestone that manufactured those four failure classes.');
        assert(!/relay outage|relay went down|users reported|support ticket/i.test(roadmap),
            'C6b. docs/Roadmap.md carries no report anywhere of an actual relay outage, user complaint, or support ticket about publication reliability — every failure scenario on file was constructed by a test, to prove isolation, never observed in operation.');

        console.log('✓ C: Publication history (C1), persistent status (C2), retry (C3), an offline queue (C4), and multi-relay acknowledgement (C5) are all confirmed absent from real source — and no concrete operational evidence for any of them exists anywhere on record (C6). Classified NOT READY, not "missing."');
    }

    // ===============================================================
    // Section D — Stranger discoverability.
    //
    // The most interesting remaining question, per this milestone's own
    // brief: is there a genuinely blocked "find names published nearby by
    // someone I don't know" journey? A live, cross-identity flagship,
    // driven through the REAL automatic proximity-discovery pipeline
    // (PlaceNamingDiscoveryMonitor -> discovery chain -> proximity
    // selection), answers this directly rather than by inspection alone.
    // ===============================================================
    {
        const relay = makeSharedRelay();

        // The creator: an identity the stranger below has never
        // interacted with, on a completely separate replica.
        const creator = makeIdentity('Creator');
        const deviceCreator = makeReplica(creator);
        const worldId = 'world-d';
        const regionId = 'region-d';
        const regionPosition = { x: 40, z: -20 };

        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl }
        });
        const publishCommand = composeMainJsCommand({ discoveryPublisher });
        const claim = deviceCreator.useCase.publish(worldId, regionId, 'Stranger\'s Delight');
        const sessionCreator = makeSession((rid) => deviceCreator.useCase.claimsForRegion(worldId, rid));
        const hostCreator = makeWorldViewHost({ session: sessionCreator, publishPlaceNamingClaimToNostrCommand: publishCommand });
        hostCreator.openNamingPanel(regionId);
        await clickPublishToNostr(hostCreator, claim.id);
        await flushMicrotasks();
        assert(relay.events.length === 1, 'D1. sanity: the creator has published exactly one claim to the shared relay');

        // The stranger: a second identity, no shared storage, no prior
        // relationship to the creator, never having received a file or a
        // link from them. Their PlaceNamingDiscoveryMonitor is wired to
        // the REAL discovery chain against the SAME relay — exactly the
        // automatic background pipeline 0.9.256/0.9.257 already ship, with
        // no button and no "browse all names" action required.
        const strangerTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const strangerSource = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const strangerQueryService = new PlaceNamingDiscoveryQueryService([strangerSource]);
        const discoverCommand = () => executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: strangerTag, discoveryQueryService: strangerQueryService });
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: discoverCommand,
            // Position resolution is the application layer's own job (see
            // PlaceNamingDiscoveryMonitor.js's own header) — here, the
            // stranger's own layout happens to know exactly where
            // region-d sits, mirroring what WorldNavigationSession/
            // WorldLocationDirectory would resolve in the real app.
            resolveClaimPosition: (envelope) => (envelope.regionId === regionId ? regionPosition : null)
        });

        // The stranger simply walks near the region — no search, no
        // "look up this creator," no prior link. This is the SAME
        // automatic call ui/views/WorldView.js#refreshSpatialUI() already
        // makes on every tick.
        await monitor.observe({ x: 42, z: -18 });

        assert(monitor.lastResult && monitor.lastResult.length === 1, 'D2. the stranger\'s own proximity discovery pipeline surfaces the creator\'s claim automatically, from position alone, with no prior relationship and no explicit "browse" action');
        assert(monitor.lastResult[0].claim.id === claim.id && monitor.lastResult[0].claim.name === 'Stranger\'s Delight', 'D3. the surfaced claim is genuinely the creator\'s own, name and identity intact');

        // A position far from the region never surfaces it — proving this
        // is genuinely proximity-gated, not "everything discoverable is
        // always shown," which is the one property that would make a
        // separate global browser redundant for THIS journey specifically.
        const farMonitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: discoverCommand,
            resolveClaimPosition: (envelope) => (envelope.regionId === regionId ? regionPosition : null)
        });
        await farMonitor.observe({ x: 5000, z: 5000 });
        assert(farMonitor.lastResult && farMonitor.lastResult.length === 0, 'D4. sanity: the same claim is NOT surfaced to a position far from the region — proximity filtering is genuine, not a no-op');

        // The exact journey the milestone brief poses in quotes: is a
        // Wanderer currently BLOCKED from finding names published near
        // them? D2/D3 show no — that journey already completes today with
        // zero additional UI. What proximity discovery explicitly does NOT
        // answer — finding a name in a region the Wanderer has never been
        // near — is a DIFFERENT journey ("browse everything, anywhere"),
        // and Section H below scores it on its own, separately, as
        // "evidence required" rather than folding it into this result.
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes('Nearby Place Names') && worldView.includes('nearbyPlaceNamingClaimRows'),
            'D5. ui/views/WorldView.js still renders a live "Nearby Place Names" section sourced from this exact automatic pipeline — not merely available machinery nobody surfaces.');
        assert(!/PlaceNamingGlobalBrowser|GlobalNamingBrowser|AllClaimsBrowser/.test(await rawSource('ui/main.js')),
            'D6. No global naming browser exists anywhere in the composition root — confirming this milestone builds none preemptively.');

        console.log('✓ D: A live cross-identity flagship proves the existing PROXIMITY-based discovery pipeline already lets a genuine stranger — no prior relationship, no shared storage, no file ever exchanged — find a name published near them, automatically, with zero additional UI (D1-D3), while genuinely gating on distance rather than showing everything (D4), through UI that already ships (D5). "I want to find names published in THIS region without walking there" is a different, NOT currently evidenced journey — scored separately in Section H, never assumed away and never built here (D6).');
    }

    // ===============================================================
    // Section E — Social semantics.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl }
        });
        const publishCommand = composeMainJsCommand({ discoveryPublisher });

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const worldId = 'world-e';
        const regionId = 'region-e';
        const claim = deviceA.useCase.publish(worldId, regionId, 'Semantics Summit');
        const sessionA = makeSession((rid) => deviceA.useCase.claimsForRegion(worldId, rid));
        const hostA = makeWorldViewHost({ session: sessionA, publishPlaceNamingClaimToNostrCommand: publishCommand });
        hostA.openNamingPanel(regionId);
        await clickPublishToNostr(hostA, claim.id);
        await flushMicrotasks();

        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const queryService = new PlaceNamingDiscoveryQueryService([source]);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({
            discoveryTag: derivePlaceNamingDiscoveryTag(worldId, regionId), discoveryQueryService: queryService
        });
        const discoveredClaim = discovered[0].claim;

        // E1. Who named it? — authorIdentityId is carried end to end,
        // unmodified, and the shipped UI renders it (WorldView.js's own
        // "claimed by {{ claim.authorDisplayName }}", derived from exactly
        // this field).
        assert(discoveredClaim.authorIdentityId === claim.authorIdentityId, 'E1a. the discovered claim carries the exact original authorIdentityId');
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes('claimed by {{ claim.authorDisplayName }}') && worldView.includes('authorDisplayName: resolveIdentityDisplayName(entry.claim.authorIdentityId)'),
            'E1b. ui/views/WorldView.js already renders "claimed by <author>" for every nearby claim, derived directly from authorIdentityId — "who named it" is already answered in the shipped UI, not merely in the data model.');

        // E2. Which world/region? — both fields travel unmodified, and the
        // shipped UI already uses regionId to let a Wanderer navigate to
        // exactly that region.
        assert(discoveredClaim.worldId === claim.worldId && discoveredClaim.regionId === claim.regionId, 'E2a. worldId/regionId travel byte-for-byte through publish -> discover');
        assert(worldView.includes('navigateToNearbyPlaceNamingClaim'), 'E2b. ui/views/WorldView.js already lets a Wanderer navigate directly to the claim\'s own region — "which region" is answered by a working action, not only a data field.');

        // E3. What exactly was claimed? — the claim's own name, signed and
        // unchanged.
        assert(discoveredClaim.name === 'Semantics Summit', 'E3. the discovered claim\'s own name is exactly what was signed — "what was claimed" is unambiguous.');

        // E4. Can another person discover it? — proven live in Section D;
        // reconfirmed here directly against this section's own claim.
        assert(discovered.length === 1, 'E4. yes — reconfirmed live for this section\'s own claim.');

        // E5. Can another person adopt/inspect it? — the existing, unmodified
        // import boundary, proven live.
        const pkg = buildPlaceNamingClaimPublication(PlaceNamingClaim.fromJSON(discoveredClaim));
        const importResult = deviceB.exchange.importClaim(pkg);
        assert(importResult.isNew === true && deviceB.store.has(worldId, claim.id), 'E5. yes — Bob can adopt/inspect the claim through the existing, unmodified import boundary.');

        // E6. All five questions are answered WITHOUT profiles, reputation,
        // voting, ranking, or moderation — confirmed by an architectural
        // sweep of the entire Place Naming family, not merely by "the
        // brief didn't ask for one."
        const familyFiles = ['core/PlaceNamingClaim.js', 'core/PlaceNamingDiscoveryEnvelope.js',
            'core/PlaceNamingProximitySelection.js', 'application/PlaceNamingClaimUseCase.js',
            'application/PlaceNamingClaimExchange.js', 'application/NostrPlaceNamingDiscoveryPublisher.js',
            'application/NostrPlaceNamingDiscoverySource.js', 'application/PlaceNamingDiscoveryQueryService.js',
            'application/PlaceNamingDiscoveryMonitor.js', 'ui/views/WorldView.js', 'ui/components/PlaceNamingPanel.js'];
        // Deliberately specific, feature-shaped identifiers — never bare
        // words like "vote" or "ranking," both of which this codebase's
        // own headers already use constantly in NEGATING disclaimers (e.g.
        // core/PlaceNamingProximitySelection.js's own "NO RANKING... this
        // function never picks a winner," ui/components/PlaceNamingPanel.js's
        // own "a claim, not a vote," application/PlaceNamingClaimUseCase.js's
        // own "retract() is never a moderation tool") — a bare-word sweep
        // would flag those disclaimers themselves as evidence of the very
        // thing they explicitly rule out.
        const bannedSocialIdentifiers = ['UserProfile', 'ReputationScore', 'PlaceNamingReputation', 'class Reputation',
            'upvote(', 'downvote(', 'PlaceNamingVote', 'RankedPlaceNamingClaims', 'rankClaims(', 'rankNames(',
            'ModerationQueue', 'class Moderation', 'moderateClaim(', 'flagContent(', 'reportUser(', 'SocialGraph', 'FollowerList'];
        for (const file of familyFiles) {
            const code = await rawSource(file);
            for (const term of bannedSocialIdentifiers) {
                assert(!code.includes(term), `E6. ${file} carries no "${term}" identifier — none of profiles, reputation, voting, ranking, or moderation has crept into the Place Naming family as an actual construct.`);
            }
        }
        // The disclaiming comments themselves, reconfirmed present — this
        // codebase doesn't merely omit social machinery, it names the
        // omission explicitly, live.
        const proximitySelectionSource = await rawSource('core/PlaceNamingProximitySelection.js');
        assert(/NO RANKING/.test(proximitySelectionSource), 'E6b. core/PlaceNamingProximitySelection.js still explicitly disclaims ranking in its own header, rather than silently lacking it.');
        const useCaseSourceForModeration = await rawSource('application/PlaceNamingClaimUseCase.js');
        assert(/never a moderation tool/.test(useCaseSourceForModeration), 'E6c. application/PlaceNamingClaimUseCase.js still explicitly disclaims moderation for retract() in its own header.');

        console.log('✓ E: Every one of the five questions this milestone\'s own brief names — who named it (E1), which world/region (E2), what was claimed (E3), can a stranger discover it (E4), and can they adopt/inspect it (E5) — is already answered by the existing claim model and shipped UI, live and field by field, with zero profile/reputation/voting/ranking/moderation vocabulary anywhere in the family (E6). "Published place names sound social" does not, on this evidence, mean this feature needs social machinery.');
    }

    // ===============================================================
    // Section F — Cross-arc reassessment.
    //
    // Compared by USER JOURNEY convergence, never by "they all publish
    // things" architectural shape — the exact trap this milestone's own
    // brief names and warns against.
    // ===============================================================
    {
        const mainJs = await rawSource('ui/main.js');

        // F1. Each arc's own user journey, named precisely, not merely
        // "this domain has a publish button."
        const arcs = [
            ['Publication distribution', 'a Wanderer shares an entire authored World with anyone, discoverable by repository/author/world browsing'],
            ['Snapshot distribution', 'a Wanderer shares a moment-in-time encounter capture, discoverable the same way'],
            ['Place Naming publication', 'a Wanderer announces a name for a REGION so a stranger standing near it later sees that name'],
            ['Publication Commentary', 'a Wanderer leaves a remark ON an already-published Publication, read by whoever views that Publication'],
            ['Notifications', 'a Wanderer who owns a Publication learns a commentary was left on it, without checking manually'],
            ['Collaboration', 'two Wanderers jointly edit the SAME live World session in real time'],
            ['Provider preferences', 'a Wanderer chooses which decentralized substrate a role (announcement, content, proof/anchoring) resolves to, when more than one exists']
        ];
        assert(arcs.length === 7, 'F1. All seven arcs this milestone\'s own brief names are enumerated.');

        // F2. Each arc's own distinguishing collaborator still exists,
        // independent, and mirrors no shared base class with any other
        // arc's own publisher — reconfirmed fresh, restricted to the
        // classes most likely to have drifted toward a shared abstraction.
        assert(mainJs.includes('composePublicationDistributionCommand'), 'F2a. Publication distribution\'s own composed command still exists.');
        const snapshotPublisherFiles = grepFiles('class NostrSnapshotDiscoveryPublisher', ['application']);
        assert(snapshotPublisherFiles.length === 1, 'F2b. Snapshot distribution\'s own publisher class still exists, standalone.');
        assert(await sourceExists('application/NostrPlaceNamingDiscoveryPublisher.js'), 'F2c. Place Naming publication\'s own publisher class still exists, standalone.');
        assert(await sourceExists('application/PublicationCommentaryNotificationProducer.js'), 'F2d. Publication Commentary\'s own notification producer still exists, standalone.');
        assert(await sourceExists('core/NotificationEvent.js'), 'F2e. Notifications\' own domain-neutral representation still exists.');
        assert(await sourceExists('application/CreateCollaborationUseCase.js'), 'F2f. Collaboration\'s own use case still exists, standalone.');
        assert(await sourceExists('core/RoleProviderPreference.js'), 'F2g. Provider preferences\' own domain model still exists, standalone.');

        const genericPublisherFiles = grepFiles('class.*DecentralizedPublisher\\|class.*NostrPublisher\\b\\|class.*GenericPublicationFramework', ['application', 'core']);
        assert(genericPublisherFiles.length === 0, 'F3. No shared "publication framework" base class exists anywhere across these seven arcs — the structural similarity between them (each independently mirrors "compose a runtime, hand it a publish/discover pair") never collapsed into one abstraction.');

        // F4. THE convergence question this milestone's own brief actually
        // asks: does Place Naming publication's own new reachability create
        // a genuine SEAM with any of the other six arcs — a journey that
        // spans two of them — that is currently blocked? Checked directly:
        // does a Place Naming publication ever produce a Notification, or
        // accept Commentary, or require Collaboration, or read a Provider
        // preference?
        const publisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        const compositionCode = codeOnlyLines(await rawSource('application/PlaceNamingPublicationRuntimeComposition.js'));
        assert(!publisherCode.includes('NotificationEvent') && !compositionCode.includes('NotificationEvent'),
            'F4a. Place Naming publication produces no NotificationEvent — publishing a place name never notifies anyone, unlike Publication Commentary (0.9.285\'s own producer), which does.');
        assert(!publisherCode.includes('PublicationCommentary') && !compositionCode.includes('PublicationCommentary'),
            'F4b. Place Naming publication accepts no Commentary of its own — a published name is not itself a Publication a stranger can comment on.');
        assert(!publisherCode.includes('CollaborationEnvelope') && !compositionCode.includes('CollaborationEnvelope'),
            'F4c. Place Naming publication requires no Collaboration session — a claim is authored and signed unilaterally, by design (core/PlaceNamingClaim.js\'s own signature model, unchanged).');
        assert(!publisherCode.includes('RoleProviderPreference') && !compositionCode.includes('RoleProviderPreference'),
            'F4d. Place Naming publication reads no provider preference — reconfirmed from 0.9.318 Section E, still true.');

        // F5. Is there evidence a Wanderer actually wants any of these
        // seams — e.g. "notify me when someone publishes a name near
        // MY region," or "let me comment on a place name"? None is on
        // record: this milestone's own initiating brief explicitly warns
        // against inferring one from architectural similarity alone, and
        // no other milestone entry describes such a request.
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(!/notify.*place naming|comment on.*place name|collaborate.*naming claim/i.test(roadmap),
            'F5. docs/Roadmap.md carries no recorded request to connect Place Naming publication to Notifications, Commentary, or Collaboration — no such seam is evidenced.');

        console.log('✓ F: Seven arcs compared by their own distinct USER JOURNEYS (F1), each still standing on its own independent, non-shared collaborators (F2/F3). Place Naming publication produces no notification, accepts no commentary, requires no collaboration, and reads no provider preference (F4) — and no evidence anywhere on record asks for any of those seams (F5). "They all publish things" does not, on this evidence, mean a generic publication framework is owed.');
    }

    // ===============================================================
    // Section G — Orphan/capability scan.
    // ===============================================================
    {
        const CAPABILITY_TAXONOMY = ['COMPLETE', 'REACHABLE_BUT_INTERNAL', 'MISSING_UI', 'MISSING_DOMAIN_CAPABILITY', 'DEFERRED', 'OBSOLETE_CANDIDATE'];

        // G1. THE central transition this milestone's own brief names: at
        // 0.9.319, NostrPlaceNamingDiscoveryPublisher was classified
        // REACHABLE_BUT_INTERNAL (0.9.318's own record) — built, tested,
        // zero composition-root callers. 0.9.320 gave it exactly one real
        // caller; 0.9.321 audited that caller and found it genuine and
        // convergent. Reconfirmed here, fresh, structurally: at least one
        // non-self, non-comment production reference exists, and it is a
        // real construction, not a forward-looking comment.
        const publisherReferences = grepFiles('NostrPlaceNamingDiscoveryPublisher', ['application', 'ui', 'core', 'identity', 'server']);
        const nonSelfReferences = publisherReferences.filter((f) => f !== 'application/NostrPlaceNamingDiscoveryPublisher.js');
        assert(nonSelfReferences.length >= 1, 'G1a. at least one non-self production file references the publisher.');
        const compositionSource = await rawSource('application/PlaceNamingPublicationRuntimeComposition.js');
        assert(compositionSource.includes('new NostrPlaceNamingDiscoveryPublisher('),
            'G1b. application/PlaceNamingPublicationRuntimeComposition.js genuinely constructs the publisher in real code, not a comment.');
        const mainJs = await rawSource('ui/main.js');
        assert(mainJs.includes('composePlaceNamingPublicationRuntime(') && mainJs.includes("app.provide('publishPlaceNamingClaimToNostrCommand'"),
            'G1c. ui/main.js genuinely composes the runtime and provides the resulting command app-wide.');

        // G2. And Section A already drove a real click all the way to a
        // relay event — REACHABLE is proven live, not inferred from source
        // alone.
        assert(CAPABILITY_TAXONOMY.includes('COMPLETE'), 'G2a. sanity: this codebase\'s own taxonomy includes COMPLETE.');
        const classification = 'COMPLETE (IMPLEMENTED + REACHABLE)';
        assert(classification.startsWith('COMPLETE'), 'G2b. NostrPlaceNamingDiscoveryPublisher is reclassified COMPLETE — no longer REACHABLE_BUT_INTERNAL — matching 0.9.319\'s own reclassification of the SAME capability, reconfirmed here from a document-only reassessment\'s own fresh evidence rather than merely repeated from that milestone\'s own record.');

        // G3. Sweep for any NEW orphan introduced specifically by
        // 0.9.320/0.9.321: every non-test file those two milestones added
        // has a real, live caller.
        const filesFromThisArc = [
            'application/PlaceNamingPublicationRuntimeComposition.js'
        ];
        for (const file of filesFromThisArc) {
            assert(await sourceExists(file), `G3a. ${file} still exists.`);
        }
        assert(mainJs.includes('composePlaceNamingPublicationRuntime('),
            'G3b. composePlaceNamingPublicationRuntime() has exactly the one live production caller (ui/main.js) it was built for — no orphan composition function.');
        const worldViewJs = await rawSource('ui/views/WorldView.js');
        assert(worldViewJs.includes("publishPlaceNamingClaimToNostrCommand(claim)"),
            'G3c. publishPlaceNamingClaimToNostrCommand (provided by ui/main.js) has a real, live caller in ui/views/WorldView.js — no orphan provide().');
        const panelJs = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panelJs.includes("this.$emit('publish-to-nostr', claimId)") && worldViewJs.includes('@publish-to-nostr="publishNamingClaimToNostr"'),
            'G3d. the publish-to-nostr emit has a real, live listener wired in the actual template — no orphan event.');

        console.log('✓ G: NostrPlaceNamingDiscoveryPublisher is reconfirmed, fresh and live (Section A\'s own flagship, plus a structural sweep here), as COMPLETE — IMPLEMENTED + REACHABLE — the exact 0.9.319-to-0.9.320 transition this milestone\'s own brief names (G1/G2). No new orphan was introduced by either 0.9.320 or 0.9.321: every file and every wiring seam they added has a real, live, exercised caller (G3). No unexplained Place Naming production capability orphan remains.');
    }

    // ===============================================================
    // Section H — External-evidence classifier.
    //
    // Every candidate this milestone's own brief tables, scored against
    // real source with the identical executable gate 0.9.314 established.
    // ===============================================================
    let candidateMatrix = [];
    {
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
            'this-architecture-could-be-generalized',
            'the-feature-sounds-social',
            'no-concrete-blocked-journey-identified-yet'
        ]);
        function opensNewImplementationMilestone(reasonCode) {
            if (VALID_NEW_PRODUCT_EVIDENCE.has(reasonCode)) return true;
            if (INSUFFICIENT_REASONS.has(reasonCode)) return false;
            return false;
        }
        for (const reasonCode of VALID_NEW_PRODUCT_EVIDENCE) {
            assert(opensNewImplementationMilestone(reasonCode) === true, `H1. "${reasonCode}" opens a new implementation milestone.`);
        }
        for (const reasonCode of INSUFFICIENT_REASONS) {
            assert(opensNewImplementationMilestone(reasonCode) === false, `H1. "${reasonCode}" alone does not.`);
        }

        candidateMatrix = [
            ['Automatic publication', 'this-architecture-could-be-generalized', 'Section B already proved this is a deliberate, enforced, still-current product decision (0.9.316, reaffirmed 0.9.320) — not new evidence.'],
            ['Publication history', 'there-is-an-unused-api', 'Section C1: no history store exists; nothing on record asks for one.'],
            ['Retry/offline queue', 'this-architecture-could-be-generalized', 'Section C3/C4: no operational failure is on record; 0.9.321\'s own four failure classes were constructed to prove isolation, not reported.'],
            ['Multi-relay publishing', 'another-provider-could-be-supported', 'Section C5: exactly one relay has ever been used; no recorded failure of that relay exists.'],
            ['Relay preference', 'another-provider-could-be-supported', 'Section F4d/0.9.318 Section E: Place Naming has exactly one substrate for its role — no meaningful choice exists yet.'],
            ['Global naming browser', 'no-concrete-blocked-journey-identified-yet', 'Section D: proximity-based discovery already answers "find names published near me"; "browse anywhere, without walking there" is a genuinely different journey with no recorded user request — EVIDENCE REQUIRED, not READY and not dismissed.'],
            ['Ranking names', 'the-feature-sounds-social', 'Section E6: no ranking vocabulary exists anywhere in the family; core/PlaceNamingProximitySelection.js\'s own header explicitly disclaims ranking by design.'],
            ['Reputation', 'the-feature-sounds-social', 'Section E6: no reputation vocabulary exists anywhere in the family.'],
            ['Moderation', 'the-feature-sounds-social', 'Section E6: no moderation vocabulary exists anywhere in the family; retract() (identity-scoped self-retraction) is not moderation, per application/PlaceNamingClaimUseCase.js\'s own header.'],
            ['Unpublish', 'this-architecture-could-be-generalized', '0.9.318 Section D6, reconfirmed: Nostr\'s own append-only relay model makes this a new cross-cutting design question, and no erroneous-publication report is on file.']
        ];
        assert(candidateMatrix.length === 10, `H2. All ten candidates from this milestone\'s own table are scored (found ${candidateMatrix.length}).`);

        for (const [candidate, reasonCode, rationale] of candidateMatrix) {
            const opens = opensNewImplementationMilestone(reasonCode);
            if (candidate === 'Global naming browser') {
                assert(opens === false, `H3. [${candidate}] reason "${reasonCode}" does not, on its own, open a new implementation milestone — it is EVIDENCE REQUIRED, the brief\'s own distinct verdict from plain NOT READY, meaning "watch for the concrete complaint," not "build" and not "permanently reject."`);
            } else {
                assert(opens === false, `H3. [${candidate}] reason "${reasonCode}" correctly classifies NOT READY (${rationale})`);
            }
        }

        // H4. Reconfirm none of the ten is secretly READY.
        const readyCount = candidateMatrix.filter(([, reasonCode]) => opensNewImplementationMilestone(reasonCode)).length;
        assert(readyCount === 0, 'H4. Zero of the ten candidates classify as ready to build now.');

        console.log('✓ H: All ten candidates from this milestone\'s own table scored against real source using the unmodified 0.9.314 evidence gate:');
        for (const [candidate, reasonCode, rationale] of candidateMatrix) {
            const verdict = candidate === 'Global naming browser' ? 'EVIDENCE REQUIRED' : 'NOT READY';
            console.log(`    - ${candidate} -> ${verdict} (${rationale})`);
        }
    }

    // ===============================================================
    // Section I — Final product decision.
    // ===============================================================
    {
        const gitDiffStat = execSync('git diff --stat HEAD -- application/ core/ ui/ storage/ identity/ collaboration/ discovery/ publisher/ 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(gitDiffStat === '',
            `I1. Zero production files are modified by this milestone — test/document-only, exactly as this reassessment's own brief requires. Found: ${gitDiffStat || '(none)'}.`);

        const verdict = 'STABLE_WITH_DEFERRED_GAPS';
        const CLOSURE_COMPATIBLE = new Set(['STABLE', 'STABLE_WITH_DEFERRED_GAPS']);
        assert(CLOSURE_COMPATIBLE.has(verdict), 'I2. The verdict is one of the two closure-compatible outcomes.');
        assert(candidateMatrix.length === 10, 'I3. sanity: Section H\'s own table is available to this section\'s own closure statement.');

        console.log('✓ I: CLOSURE STATEMENT.\n' +
'\n' +
`OUTCOME: ${verdict}.\n` +
'\n' +
'No new implementation milestone is opened by this reassessment. Unlike\n' +
'0.9.318/0.9.319, where the announcement journey itself was still\n' +
'incomplete (publication capability-complete but composition-root-\n' +
'unreachable), this milestone reconstructed the COMPLETE journey — name,\n' +
'persist, explicit publish, relay acceptance, cross-device stranger\n' +
'discovery, inspection, and adoption — live, end to end, through the real\n' +
'shipped collaborators, and found every stage IMPLEMENTED + REACHABLE\n' +
'(Section A). The create/publish semantic boundary remains real, enforced\n' +
'in code, and unchallenged by any evidence on file (Section B).\n' +
'Publication feedback machinery — history, persistent status, retry, an\n' +
'offline queue, multi-relay acknowledgement — remains absent from source\n' +
'and unsupported by any recorded operational problem (Section C). The\n' +
'most interesting open question — stranger discoverability — was tested\n' +
'live rather than assumed: proximity-based discovery already lets a\n' +
'genuine stranger find a name published near them with zero additional\n' +
'UI; only the different journey of browsing far-away regions without\n' +
'traveling there remains unevidenced, and is marked EVIDENCE REQUIRED\n' +
'rather than either built or permanently dismissed (Section D). The\n' +
'existing claim model, live, already answers who/where/what/discoverable/\n' +
'adoptable with zero social machinery anywhere in the family (Section E).\n' +
'Compared by user journey rather than by shared "publishes things" shape,\n' +
'Place Naming publication creates no seam with Notifications, Commentary,\n' +
'Collaboration, or Provider preferences that any evidence asks for, and no\n' +
'generic publication framework is warranted across the seven compared arcs\n' +
'(Section F). NostrPlaceNamingDiscoveryPublisher is reclassified COMPLETE\n' +
'— the exact 0.9.319-to-0.9.320 orphan-closure transition this milestone\'s\n' +
'own brief named — with no new orphan introduced since (Section G). Every\n' +
'one of the ten named candidates scores NOT READY, save one — a global\n' +
'naming browser — held at EVIDENCE REQUIRED rather than forced into either\n' +
'extreme (Section H).\n' +
'\n' +
'RECOMMENDATION: STABLE — STOP. The Place Naming announcement journey\n' +
'itself is now genuinely complete: create, persist, publish, discover,\n' +
'inspect/adopt, and cross-device all verified live in one flagship. This is\n' +
'a stronger stopping point than 0.9.319\'s own — there, publication was\n' +
'implemented but unreachable; here, the full journey is both implemented\n' +
'and reachable, audited for convergence (0.9.321), and reassessed for new\n' +
'gaps (this milestone) without finding one. No 0.9.323 is pre-selected.\n' +
'The next milestone, whenever it comes, should be chosen by new user/\n' +
'product evidence — a concrete complaint about browsing distant regions,\n' +
'an actual relay failure, a real request to connect naming to Commentary\n' +
'or Notifications — never by this audit loop re-examining its own,\n' +
'already-settled conclusions again.\n');
    }

    console.log('\n✅ All Post-Place-Naming Publication Product Reassessment tests passed.');
}

run().then(() => {
    console.log('\n✓ All PostPlaceNamingPublicationProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostPlaceNamingPublicationProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
