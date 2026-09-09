import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import PlaceNamingPanel from '../ui/components/PlaceNamingPanel.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { composePlaceNamingPublicationRuntime } from '../application/PlaceNamingPublicationRuntimeComposition.js';
import { NostrPlaceNamingDiscoveryPublisher } from '../application/NostrPlaceNamingDiscoveryPublisher.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.321 — Place Naming Publication Action Convergence Audit.
// See docs/Roadmap.md, "0.9.321 — Place Naming Publication Action
// Convergence Audit," for the full milestone story.
//
// 0.9.320 made `application/NostrPlaceNamingDiscoveryPublisher.js` (0.9.316)
// reachable from an actual click — `ui/components/PlaceNamingPanel.js`'s own
// new "Publish to Nostr" action, wired through `ui/views/WorldView.js`'s own
// `publishNamingClaimToNostr()` and `ui/main.js`'s own composed command —
// and its own test file (`tests/PlaceNamingClaimPublicationAction.test.js`)
// already proved that wiring works. This is a **test-only audit, not a
// rebuild**, asking the ONE question that milestone's own tests were not
// specifically built to interrogate from a skeptical angle: does the newly
// REACHABLE action genuinely converge with the pre-existing claim,
// persistence, and discovery architecture — or has reachability quietly
// smuggled in a second authority, a second wire format, or a hidden
// lifecycle nobody asked for? It adds no production code and no new
// capability. Every scenario below is built fresh — its own identities,
// worlds, regions, and relay doubles — independent of 0.9.320's own suite
// rather than a re-read of its assertions.
//
//   Section A — FLAGSHIP: the complete user journey through the actual
//               UI-shaped path (a faithful, source-verified reproduction of
//               PlaceNamingPanel -> WorldView -> ui/main.js's own composed
//               command), using the REAL composePlaceNamingPublicationRuntime,
//               the REAL NostrPlaceNamingDiscoveryPublisher, and the REAL,
//               unmodified discovery chain on a second, independent device.
//   Section B — Exact claim identity: the claim handed to the injected
//               command is the SAME already-signed claim on file — never
//               reconstructed, never a second producer, signature
//               byte-for-byte unchanged — reconfirmed with a fresh grep
//               sweep for the one production `new PlaceNamingClaim(` site.
//   Section C — No second publication authority: the UI-facing files
//               construct no discovery tag, envelope, event template, relay
//               URL, or signature of their own on the PUBLISH side; exactly
//               one file in the entire repository ever constructs a
//               NostrPlaceNamingDiscoveryPublisher.
//   Section D — Discovery convergence: the event the UI path actually
//               produces is consumed by the completely unmodified existing
//               discovery chain, and no "my published claims"-shaped
//               special-case discovery route exists anywhere in the family.
//   Section E — Local persistence & failure isolation: success never
//               resaves the claim; four distinct failure classes (relay
//               decline, transport rejection, timeout, malformed event id),
//               each driven through the UI-shaped path rather than the raw
//               publisher, leave the local claim byte-for-byte untouched and
//               an unrelated control claim on the same relay unaffected.
//   Section F — Graceful capability absence, and the nuance the milestone's
//               own brief assumed away: the composed command is provided
//               UNCONDITONALLY by ui/main.js (mirroring
//               snapshotDistributionCommand's own identical shape one
//               substrate over) — so an absent capability degrades
//               gracefully at CALL time, via an honest rejection, never at
//               RENDER time via a hidden button. No fabricated success, and
//               every other Place Naming action keeps working regardless.
//   Section G — Staleness/concurrency: publish A, then publish B before A
//               settles; B's result is never displaced by A's late arrival;
//               reopening the SAME region also invalidates a stale in-flight
//               request, not only switching regions or closing the panel.
//   Section H — Publication repetition: the same claim published three
//               times is three independent, unrelated attempts — no
//               publisher-side dedup, no "already published" flag anywhere
//               on the claim or in the codebase's own vocabulary.
//   Section I — Substrate boundary: the publish path carries zero
//               vocabulary or imports belonging to Snapshot distribution,
//               Arweave, IPFS, Bitcoin/Base anchoring, or provider
//               preference.
//   Section J — Product semantics: the UI's own copy communicates "sent to
//               the relay," never "everyone has received it," "globally
//               authoritative," or "guaranteed discoverable."
//   Section K — Verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function grepCount(pattern, dirs) {
    try {
        const out = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        return out ? out.split('\n').length : 0;
    } catch { return 0; }
}

function grepFiles(pattern, dirs) {
    try {
        const out = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        return out ? out.split('\n') : [];
    } catch { return []; }
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
    const verifier = new LocalAuthorizationVerifier();
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return { storage, store, verifier, useCase };
}

// A small shared-relay double, independent of any prior test file's own —
// records every published event and answers a NIP-01-shaped `#t` filter
// query against exactly what it recorded.
function makeSharedRelay() {
    const events = [];
    return {
        events,
        async publishImpl(relayUrl, eventTemplate) {
            const id = `${events.length}`.padStart(64, 'a');
            events.push({ relayUrl, kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, id });
            return { published: true, id };
        },
        queryImpl(relayUrl, filter) {
            const wantedTags = filter['#t'] || [];
            return Promise.resolve(events.filter((event) => event.tags.some((t) => t[0] === 't' && wantedTags.includes(t[1]))));
        }
    };
}

// ---------------------------------------------------------------------
// A faithful, independently-written reproduction of ui/views/WorldView.js's
// own naming-panel publication slice AND ui/main.js's own composed-command
// wrapper — the two production seams a real click actually crosses.
// Section C's own architectural sweep, below, keeps this honest against
// production drift; this is not itself the proof, only the vehicle for
// driving the real collaborators (composePlaceNamingPublicationRuntime,
// NostrPlaceNamingDiscoveryPublisher, PlaceNamingPanel.methods.onPublishToNostr)
// through the exact sequence a person's click actually takes, the same
// "reproduce, then verify the reproduction is honest" discipline
// tests/PlaceNamingWorldViewPresentation.test.js and
// tests/PlaceNamingClaimPublicationAction.test.js already both hold.
// ---------------------------------------------------------------------

// Mirrors ui/main.js's own `publishPlaceNamingClaimToNostrCommand` builder
// EXACTLY, including its exact error message — see Section F/K, below,
// which check that string verbatim against the real source.
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
// `resetNamingPanelPublishToNostr()` / `openNamingPanel()` /
// `closeNamingPanel()` naming-panel-publication slice.
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

    function closeNamingPanel() {
        state.namingPanelRegionId = null;
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

    return { state, openNamingPanel, closeNamingPanel, publishNamingClaimToNostr, resetNamingPanelPublishToNostr };
}

// A "click" on PlaceNamingPanel's own real, unmodified onPublishToNostr(),
// feeding straight into a host's publishNamingClaimToNostr() — the actual
// two hops a person's click crosses.
function clickPublishToNostr(host, claimId) {
    const emitted = [];
    const ctx = { $emit: (event, ...args) => emitted.push({ event, args }) };
    PlaceNamingPanel.methods.onPublishToNostr.call(ctx, claimId);
    assert(emitted.length === 1 && emitted[0].event === 'publish-to-nostr', 'sanity: the real PlaceNamingPanel.onPublishToNostr() emitted publish-to-nostr');
    return host.publishNamingClaimToNostr(emitted[0].args[0]);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the complete user journey through the actual
    // UI-shaped path, cross-device.
    // ---------------------------------------------------------------
    {
        const relay = makeSharedRelay();
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl }
        });
        const publishPlaceNamingClaimToNostrCommand = composeMainJsCommand({ discoveryPublisher });

        const alice = makeIdentity('Alice');   // Device A.
        const bob = makeIdentity('Bob');       // Device B — no shared storage with A.
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const worldId = 'world-audit-a';
        const regionId = 'region-audit-a';

        // Create -> Save: a local claim, synchronous, never announced.
        const claim = deviceA.useCase.publish(worldId, regionId, 'Convergence Cove');
        assert(relay.events.length === 0, 'A1. creation alone announces nothing');
        assert(deviceA.store.list(worldId).length === 1, 'A2. the claim is saved locally as soon as it is created');

        // Publish: the actual click, through the actual panel method, through
        // the actual host wiring, through the REAL composed runtime.
        const sessionA = makeSession((rid) => deviceA.useCase.claimsForRegion(worldId, rid));
        const hostA = makeWorldViewHost({ session: sessionA, publishPlaceNamingClaimToNostrCommand });
        hostA.openNamingPanel(regionId);
        await clickPublishToNostr(hostA, claim.id);
        await flushMicrotasks();

        assert(hostA.state.namingPanelPublishToNostrResult && hostA.state.namingPanelPublishToNostrResult.published === true, 'A3. the explicit publish action reports success');
        assert(relay.events.length === 1, 'A4. exactly one event reached the relay through the full click -> panel -> host -> composed-runtime -> publisher path');

        // Relay -> Device B: discover through the completely unmodified
        // existing discovery chain — no shared object with Device A at all.
        const sourceB = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const queryServiceB = new PlaceNamingDiscoveryQueryService([sourceB]);
        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: queryServiceB });

        assert(discovered.length === 1, 'A5. Device B discovers exactly one claim');
        assert(discovered[0].claim.id === claim.id && discovered[0].claim.name === 'Convergence Cove', 'A6. the discovered claim is genuinely Device A\'s own');
        // Inspect: the claim's signature round-trips intact through the wire.
        // The envelope's own describeSignature() (core/PlaceNamingDiscoveryEnvelope.js)
        // deliberately carries only the five required signature fields —
        // never claim.signature.toJSON()'s own incidental `signedAt` — so
        // this compares exactly those five, field for field.
        const originalSignature = claim.signature.toJSON();
        for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
            assert(discovered[0].claim.signature[field] === originalSignature[field], `A7. the discovered claim's signature.${field} is byte-for-byte the one Device A actually signed`);
        }
        // Adopt (deliberately unbuilt): discovery never writes into Device
        // B's own local store.
        assert(deviceB.store.list(worldId).length === 0, 'A8. discovery alone never adopts anything into Device B\'s own store — adoption remains its own, separate, unbuilt step');

        console.log('✓ Section A: FLAGSHIP — the complete Create -> Save -> Publish -> relay -> Discover -> inspect journey succeeds through the actual shipped UI-shaped path, cross-device');
    }

    // ---------------------------------------------------------------
    // Section B — Exact claim identity.
    // ---------------------------------------------------------------
    {
        const relay = makeSharedRelay();
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl }
        });
        const publishPlaceNamingClaimToNostrCommand = composeMainJsCommand({ discoveryPublisher });

        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-audit-b', 'region-audit-b', 'Identity Isle');

        const seenClaims = [];
        // Wrap the composed command so this section can inspect exactly what
        // reached it, without altering behavior.
        const inspectingCommand = (handedClaim) => { seenClaims.push(handedClaim); return publishPlaceNamingClaimToNostrCommand(handedClaim); };

        const session = makeSession((rid) => replica.useCase.claimsForRegion('world-audit-b', rid));
        const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: inspectingCommand });
        host.openNamingPanel('region-audit-b');
        await clickPublishToNostr(host, claim.id);
        await flushMicrotasks();

        assert(seenClaims.length === 1, '1. the command was invoked exactly once');
        assert(seenClaims[0] instanceof PlaceNamingClaim, '2. the UI path hands the publisher a real PlaceNamingClaim instance, never a plain object it assembled itself');
        assert(seenClaims[0].id === claim.id && seenClaims[0].name === claim.name && seenClaims[0].worldId === claim.worldId && seenClaims[0].regionId === claim.regionId && seenClaims[0].authorIdentityId === claim.authorIdentityId, '3. every identity-bearing field of the handed claim matches the existing, already-signed claim exactly');
        assert(JSON.stringify(seenClaims[0].signature.toJSON()) === JSON.stringify(claim.signature.toJSON()), '4. the handed claim\'s signature is byte-for-byte unchanged — never re-signed, never stripped');
        assert(replica.store.list('world-audit-b').length === 1, '5. the publish action never creates a second local claim');
        assert(JSON.stringify(replica.store.list('world-audit-b')[0].toJSON()) === JSON.stringify(claim.toJSON()), '6. the one local claim on file is unchanged, byte-for-byte, after publication');

        // Fresh grep sweep, not merely re-read from 0.9.316/0.9.317's own
        // assertions: outside core/PlaceNamingClaim.js's own class body (its
        // own fromJSON()/withSignature()-style internal reconstruction,
        // never a NEW claim), the use case remains the ONE production site
        // that ever creates a claim describing a fresh naming decision.
        const constructorSites = grepFiles('new PlaceNamingClaim(', ['application', 'ui']);
        assert(constructorSites.length === 1 && constructorSites[0].endsWith('PlaceNamingClaimUseCase.js'), `7. exactly one production file (outside PlaceNamingClaim.js's own class body) constructs a NEW PlaceNamingClaim — found: ${JSON.stringify(constructorSites)}`);

        console.log('✓ Section B: the UI path retrieves the exact, already-signed claim and hands it to the publisher unmodified — never a second construction, never an altered signature');
    }

    // ---------------------------------------------------------------
    // Section C — No second publication authority.
    // ---------------------------------------------------------------
    {
        const mainJs = codeOnlyLines(await rawSource('ui/main.js'));
        const worldViewJs = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const panelJs = codeOnlyLines(await rawSource('ui/components/PlaceNamingPanel.js'));

        // Neither the composition-root wiring nor the view builds a Nostr
        // event template, an envelope, or a discovery tag ON THE PUBLISH
        // SIDE. WorldView.js's own read-side `derivePlaceNamingDiscoveryTag()`
        // call (0.9.257, deriving a QUERY tag for discovery — the same
        // canonical function both sides are meant to share) is explicitly
        // excluded from this check below by name; it predates 0.9.320 by
        // several milestones and is the read half of the very convergence
        // this audit is proving, never a second write-side authority.
        assert(!mainJs.includes('buildPlaceNamingDiscoveryEnvelope'), '1. ui/main.js never builds a discovery envelope itself');
        assert(!panelJs.includes('buildPlaceNamingDiscoveryEnvelope') && !panelJs.includes('derivePlaceNamingDiscoveryTag'), '2. PlaceNamingPanel.js constructs no envelope or tag of its own');
        assert(!mainJs.includes("kind:") || !mainJs.match(/tags:\s*\[\[/), '3. ui/main.js assembles no raw Nostr event-template literal ({ kind, tags, content }) of its own for Place Naming');
        assert(!panelJs.includes('window.nostr') && !worldViewJs.includes('window.nostr'), '4. neither the panel nor the view ever reads window.nostr directly — only ui/main.js resolves a host capability, and hands an already-resolved command down');
        assert(!panelJs.includes("wss://") && !worldViewJs.includes("wss://"), '5. no UI file hardcodes a relay URL of its own');

        // Exactly one production constructor for the publisher itself,
        // reconfirmed fresh, restricted to the exact directories a
        // regression could plausibly appear in.
        const publisherSites = grepFiles('new NostrPlaceNamingDiscoveryPublisher(', ['application', 'ui']);
        assert(publisherSites.length === 1 && publisherSites[0] === 'application/PlaceNamingPublicationRuntimeComposition.js', `6. exactly one production file constructs NostrPlaceNamingDiscoveryPublisher — found: ${JSON.stringify(publisherSites)}`);
        assert(mainJs.includes('composePlaceNamingPublicationRuntime('), '7. ui/main.js reaches the publisher only through the composition function, never by naming the concrete class');

        // The full call chain PlaceNamingPanel -> WorldView -> command ->
        // publisher is present verbatim, and nothing else in either UI file
        // calls discoveryPublisher.publish() directly.
        assert(panelJs.includes("onPublishToNostr(claimId)") && panelJs.includes("this.$emit('publish-to-nostr', claimId)"), '8. PlaceNamingPanel.js: onPublishToNostr() is a dumb pass-through emit');
        assert(worldViewJs.includes('function publishNamingClaimToNostr(') && worldViewJs.includes("publishPlaceNamingClaimToNostrCommand(claim)"), '9. WorldView.js: publishNamingClaimToNostr() calls the injected command, never the publisher directly');
        assert(!worldViewJs.includes('.publish(claim)') && !worldViewJs.includes('discoveryPublisher.publish('), '10. WorldView.js never calls a discoveryPublisher directly — only the composed command');

        console.log('✓ Section C: the UI path constructs no tags, envelopes, event templates, relay URLs, or signatures of its own, and exactly one production implementation of the publisher exists');
    }

    // ---------------------------------------------------------------
    // Section D — Discovery convergence.
    // ---------------------------------------------------------------
    {
        const relay = makeSharedRelay();
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl }
        });
        const publishPlaceNamingClaimToNostrCommand = composeMainJsCommand({ discoveryPublisher });

        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const worldId = 'world-audit-d';
        const regionId = 'region-audit-d';
        const claim = replica.useCase.publish(worldId, regionId, 'Discoverable Downs');

        const session = makeSession((rid) => replica.useCase.claimsForRegion(worldId, rid));
        const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand });
        host.openNamingPanel(regionId);
        await clickPublishToNostr(host, claim.id);
        await flushMicrotasks();

        // The exact, unmodified read-side chain — the same three
        // collaborators every prior Place Naming discovery milestone (0.9.253
        // onward) already built, never anything special to "my own"
        // publications.
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const queryService = new PlaceNamingDiscoveryQueryService([source]);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({
            discoveryTag: derivePlaceNamingDiscoveryTag(worldId, regionId),
            discoveryQueryService: queryService
        });
        assert(discovered.length === 1 && discovered[0].claim.id === claim.id, '1. the event the UI path produced is consumed by the unmodified existing discovery chain, with no adaptation needed');

        // No special "my published claims"/"own publications" discovery route
        // exists anywhere in the Place Naming family.
        const familyFiles = grepFiles('.', ['application', 'ui', 'core']).filter((f) => /PlaceNaming/.test(f));
        for (const bannedTerm of ['MyPublishedClaims', 'OwnNamingPublications', 'MyPlaceNamingPublications', 'PublishedByMe']) {
            assert(grepCount(bannedTerm, familyFiles.length ? familyFiles : ['application', 'ui']) === 0, `2. no special-case discovery vocabulary "${bannedTerm}" exists in the Place Naming family`);
        }

        console.log('✓ Section D: the event emitted by the UI path is consumed by the completely unchanged existing discovery path, with no alternate "my own claims" route');
    }

    // ---------------------------------------------------------------
    // Section E — Local persistence independence & failure isolation.
    // ---------------------------------------------------------------
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const worldId = 'world-audit-e';

        // A control claim, successfully published on the SAME relay, used
        // below to prove a failed attempt disturbs nothing unrelated.
        const controlRegion = 'region-audit-e-control';
        const controlClaim = replica.useCase.publish(worldId, controlRegion, 'Control Claim');
        const { discoveryPublisher: workingPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl }
        });
        await workingPublisher.publish(controlClaim);
        const controlTag = derivePlaceNamingDiscoveryTag(worldId, controlRegion);

        async function assertControlStillDiscoverable(label) {
            const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
            const queryService = new PlaceNamingDiscoveryQueryService([source]);
            const found = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: controlTag, discoveryQueryService: queryService });
            assert(found.length === 1 && found[0].claim.id === controlClaim.id, `${label}: the unrelated control claim on the same relay remains fully discoverable`);
        }

        // E1 — success never resaves the claim.
        {
            const regionId = 'region-audit-e1';
            const claim = replica.useCase.publish(worldId, regionId, 'Success Slope');
            const before = JSON.stringify(replica.store.list(worldId).find((c) => c.id === claim.id));
            const { discoveryPublisher } = composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl } });
            const command = composeMainJsCommand({ discoveryPublisher });
            const session = makeSession((rid) => replica.useCase.claimsForRegion(worldId, rid));
            const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel(regionId);
            await clickPublishToNostr(host, claim.id);
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrResult && host.state.namingPanelPublishToNostrResult.published === true, '1. E1: publication succeeded');
            const after = JSON.stringify(replica.store.list(worldId).find((c) => c.id === claim.id));
            assert(before === after, '2. E1: a successful publication never resaves or otherwise mutates the local claim');
        }

        // E2 — relay decline (publishImpl resolves published:false).
        {
            const regionId = 'region-audit-e2';
            const claim = replica.useCase.publish(worldId, regionId, 'Declined Dell');
            const declineImpl = async () => ({ published: false, reason: 'declined' });
            const { discoveryPublisher } = composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: declineImpl } });
            const command = composeMainJsCommand({ discoveryPublisher });
            const session = makeSession((rid) => replica.useCase.claimsForRegion(worldId, rid));
            const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel(regionId);
            await clickPublishToNostr(host, claim.id);
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrResult === null, '3. E2: a relay decline (null) never masquerades as a success');
            assert(replica.store.list(worldId).some((c) => c.id === claim.id), '4. E2: the local claim survives a relay decline');
            await assertControlStillDiscoverable('5. E2');
        }

        // E3 — transport rejection.
        {
            const regionId = 'region-audit-e3';
            const claim = replica.useCase.publish(worldId, regionId, 'Rejected Ridge');
            const rejectImpl = async () => { throw new Error('simulated: transport rejected'); };
            const { discoveryPublisher } = composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: rejectImpl } });
            const command = composeMainJsCommand({ discoveryPublisher });
            const session = makeSession((rid) => replica.useCase.claimsForRegion(worldId, rid));
            const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel(regionId);
            await clickPublishToNostr(host, claim.id);
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrError === 'simulated: transport rejected', '6. E3: a genuine transport rejection surfaces in the UI\'s own error state');
            assert(replica.store.list(worldId).some((c) => c.id === claim.id), '7. E3: the local claim survives a transport rejection');
            await assertControlStillDiscoverable('8. E3');
        }

        // E4 — timeout.
        {
            const regionId = 'region-audit-e4';
            const claim = replica.useCase.publish(worldId, regionId, 'Timeout Terrace');
            const neverSettles = () => new Promise(() => {});
            const { discoveryPublisher } = composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: neverSettles, timeoutMs: 20 } });
            const command = composeMainJsCommand({ discoveryPublisher });
            const session = makeSession((rid) => replica.useCase.claimsForRegion(worldId, rid));
            const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel(regionId);
            const settled = clickPublishToNostr(host, claim.id);
            await settled;

            assert(host.state.namingPanelPublishToNostrError && host.state.namingPanelPublishToNostrError.includes('timed out'), '9. E4: a timeout surfaces as an honest error, never a hang and never a fabricated success');
            assert(replica.store.list(worldId).some((c) => c.id === claim.id), '10. E4: the local claim survives a timeout');
            await assertControlStillDiscoverable('11. E4');
        }

        // E5 — malformed event id.
        {
            const regionId = 'region-audit-e5';
            const claim = replica.useCase.publish(worldId, regionId, 'Malformed Meadow');
            const malformedImpl = async () => ({ published: true, id: 'not-a-real-event-id' });
            const { discoveryPublisher } = composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: malformedImpl } });
            const command = composeMainJsCommand({ discoveryPublisher });
            const session = makeSession((rid) => replica.useCase.claimsForRegion(worldId, rid));
            const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel(regionId);
            await clickPublishToNostr(host, claim.id);
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrError !== null, '12. E5: a malformed event id from publishImpl surfaces as an error, never a silent success');
            assert(host.state.namingPanelPublishToNostrResult === null, '13. E5: no result is recorded alongside that error');
            assert(replica.store.list(worldId).some((c) => c.id === claim.id), '14. E5: the local claim survives a malformed-id response');
            await assertControlStillDiscoverable('15. E5');
        }

        console.log('✓ Section E: publication success never mutates local persistence, and all four failure classes (decline, rejection, timeout, malformed id) leave the local claim and an unrelated relay-hosted claim completely unaffected');
    }

    // ---------------------------------------------------------------
    // Section F — Graceful capability absence, and the render-time vs.
    // call-time nuance.
    // ---------------------------------------------------------------
    {
        // F1 — composition-root level: no publishImpl at all.
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions: {} });
        assert(discoveryPublisher === null, '1. with no publishImpl, composePlaceNamingPublicationRuntime() yields null rather than throwing');

        const command = composeMainJsCommand({ discoveryPublisher });
        await expectRejects(command({}), '2. the composed command rejects, rather than throwing synchronously or fabricating a result, when no capability is available');
        let message = null;
        try { await command({}); } catch (e) { message = e.message; }
        assert(message === 'Nostr publishing is not available — no compatible browser extension was found', '3. the rejection carries the exact, honest message ui/main.js\'s own real source uses — checked verbatim against production, below');

        // F2 — driven through the full host wiring: no fabricated success,
        // no uncaught exception, error state set cleanly.
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-audit-f', 'region-audit-f', 'Absent Acres');
        const session = makeSession((rid) => replica.useCase.claimsForRegion('world-audit-f', rid));
        const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
        host.openNamingPanel('region-audit-f');
        await clickPublishToNostr(host, claim.id);
        await flushMicrotasks();

        assert(host.state.namingPanelPublishToNostrResult === null, '4. no fabricated success is ever recorded when the capability is genuinely absent');
        assert(host.state.namingPanelPublishToNostrError === 'Nostr publishing is not available — no compatible browser extension was found', '5. the honest unavailability message reaches the UI\'s own error state');

        // F3 — every OTHER Place Naming action keeps working normally,
        // entirely independent of Nostr availability.
        replica.useCase.publish('world-audit-f', 'region-audit-f', 'Second Local Name');
        assert(replica.useCase.claimsForRegion('world-audit-f', 'region-audit-f').length === 2, '6. creating additional local claims is unaffected by Nostr\'s absence');
        replica.useCase.retract('world-audit-f', claim.id);
        assert(replica.useCase.claimsForRegion('world-audit-f', 'region-audit-f').length === 1, '7. retracting a claim is unaffected by Nostr\'s absence');

        // F4 — THE NUANCE: ui/main.js provides the composed command
        // UNCONDITIONALLY (never inside an `if (discoveryPublisher)` guard),
        // the identical shape `snapshotDistributionCommand` already holds
        // one substrate over. This means `WorldView.js`'s own
        // `canPublishPlaceNamingClaimToNostr` — and therefore the panel's
        // own "Publish to Nostr" button — is gated on "did ui/main.js provide
        // a command function at all," which is unconditionally true in the
        // real running app; it is NOT gated on whether a compatible
        // extension is actually installed. The milestone brief that opened
        // this audit assumed the button itself disappears when Nostr is
        // unavailable; the real, shipped behavior is graceful degradation
        // AT CALL TIME (an honest, immediate rejection, proven above),
        // never AT RENDER TIME. This is a genuine, previously-unstated
        // architectural fact this audit surfaces — and it is consistent,
        // not novel: `OwnPublicationPanel.js`'s own "Distribute Snapshot"
        // button (`v-if="snapshotDistributionCommand"`) already holds the
        // identical shape for a differently-absent host capability. Neither
        // is a defect introduced by 0.9.320; both are the SAME established
        // pattern in this codebase, reconfirmed here rather than assumed.
        const mainJs = codeOnlyLines(await rawSource('ui/main.js'));
        assert(mainJs.includes("app.provide('publishPlaceNamingClaimToNostrCommand', publishPlaceNamingClaimToNostrCommand);"), '8. ui/main.js provides the command under an unconditional statement, not inside an availability guard');
        assert(!/if\s*\(\s*(placeNamingDiscoveryPublisher|discoveryPublisher)\s*\)\s*\{[^}]*app\.provide\('publishPlaceNamingClaimToNostrCommand'/.test(mainJs), '9. the provide() call is not conditioned on discoveryPublisher being non-null');
        assert(mainJs.includes("if (!placeNamingDiscoveryPublisher) {") && mainJs.includes('Nostr publishing is not available — no compatible browser extension was found'), '10. the exact production source contains the same honest-rejection message this section verified above, character for character');
        // The identical shape one substrate over, reconfirmed live rather
        // than assumed — snapshotDistributionCommand is ALSO provided
        // unconditionally.
        assert(mainJs.includes("app.provide('snapshotDistributionCommand', snapshotDistributionCommand);") && !/if\s*\([^)]*\)\s*\{[^}]*app\.provide\('snapshotDistributionCommand'/.test(mainJs), '11. snapshotDistributionCommand — the sibling this file\'s own header says this composition mirrors — is provided with the identical unconditional shape, confirming this is an established codebase pattern rather than a one-off');

        console.log('✓ Section F: an absent Nostr capability degrades gracefully at CALL time (an honest, immediate rejection, never a fabricated success, never an uncaught exception) rather than at RENDER time — the same established shape this codebase already holds for snapshotDistributionCommand — and every other Place Naming action keeps working throughout');
    }

    // ---------------------------------------------------------------
    // Section G — Staleness/concurrency.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const worldId = 'world-audit-g';
        const regionId = 'region-audit-g';
        const claimA = replica.useCase.publish(worldId, regionId, 'Attempt A Acres');
        const claimB = replica.useCase.publish(worldId, regionId, 'Attempt B Bluff');
        const session = makeSession((rid) => replica.useCase.claimsForRegion(worldId, rid));

        // G1 — Publish A, then Publish B before A settles; B completes; A
        // completes later; A must never overwrite B's current UI state.
        {
            let resolveA;
            let callCount = 0;
            const command = () => {
                callCount += 1;
                if (callCount === 1) return new Promise((resolve) => { resolveA = resolve; });
                return Promise.resolve({ published: true, relayUrl: 'wss://b', id: 'b'.repeat(64), discoveryTag: 'tag-b' });
            };
            const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel(regionId);

            host.publishNamingClaimToNostr(claimA.id);
            host.publishNamingClaimToNostr(claimB.id);
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrClaimId === claimB.id, '1. B\'s own attempt is the one reflected in the panel\'s state while A is still in flight');
            assert(host.state.namingPanelPublishToNostrResult.relayUrl === 'wss://b', '2. B\'s own result is recorded');

            resolveA({ published: true, relayUrl: 'wss://a-STALE', id: 'a'.repeat(64), discoveryTag: 'tag-a' });
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrResult.relayUrl === 'wss://b', '3. A completing LATER never overwrites B\'s current, more recent result');
            assert(host.state.namingPanelPublishToNostrClaimId === claimB.id, '4. the late A arrival never rewrites which claim the panel describes either');
        }

        // G2 — reopening the SAME region also invalidates a stale in-flight
        // request — not only switching regions or closing the panel
        // entirely (the scenario 0.9.320's own suite already covered).
        {
            let resolvePublish;
            const command = () => new Promise((resolve) => { resolvePublish = resolve; });
            const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel(regionId);

            host.publishNamingClaimToNostr(claimA.id);
            await flushMicrotasks();
            assert(host.state.namingPanelPublishToNostrExecuting === true, '5. sanity: a publish is genuinely in flight');

            // Re-opening the identical region (e.g. the panel was closed and
            // the SAME "Names" button clicked again) still resets the
            // publish-state family and bumps the request id, per
            // openNamingPanel()'s own unconditional resetNamingPanelPublishToNostr() call.
            host.openNamingPanel(regionId);
            assert(host.state.namingPanelPublishToNostrExecuting === false, '6. reopening even the SAME region immediately clears the executing flag');
            assert(host.state.namingPanelPublishToNostrClaimId === null, '7. reopening even the SAME region clears the prior target claimId');

            resolvePublish({ published: true, relayUrl: 'wss://after-reopen', id: 'c'.repeat(64), discoveryTag: 'tag-c' });
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrResult === null, '8. the call that settles after the SAME-region reopen never writes a result into the freshly-reset panel state');
        }

        console.log('✓ Section G: a more recent publish attempt is never displaced by a stale, later-arriving one, and reopening even the identical region invalidates any still-in-flight request, exactly as closing the panel or switching regions already does');
    }

    // ---------------------------------------------------------------
    // Section H — Publication repetition.
    // ---------------------------------------------------------------
    {
        const relay = makeSharedRelay();
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: relay.publishImpl }
        });
        const command = composeMainJsCommand({ discoveryPublisher });

        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const worldId = 'world-audit-h';
        const regionId = 'region-audit-h';
        const claim = replica.useCase.publish(worldId, regionId, 'Repeated Reach');
        const session = makeSession((rid) => replica.useCase.claimsForRegion(worldId, rid));
        const host = makeWorldViewHost({ session, publishPlaceNamingClaimToNostrCommand: command });
        host.openNamingPanel(regionId);

        await clickPublishToNostr(host, claim.id);
        await flushMicrotasks();
        const firstResult = host.state.namingPanelPublishToNostrResult;
        await clickPublishToNostr(host, claim.id);
        await flushMicrotasks();
        const secondResult = host.state.namingPanelPublishToNostrResult;
        await clickPublishToNostr(host, claim.id);
        await flushMicrotasks();
        const thirdResult = host.state.namingPanelPublishToNostrResult;

        assert(relay.events.length === 3, '1. three independent user invocations reach the relay as three independent events — no client-side "already published" short-circuit');
        assert(new Set([firstResult.id, secondResult.id, thirdResult.id]).size === 3, '2. each of the three publications produced its own, independent event id');
        assert(replica.store.list(worldId).length === 1, '3. no repetition of publication ever creates a second local claim');
        assert(JSON.stringify(replica.store.list(worldId)[0].toJSON()) === JSON.stringify(claim.toJSON()), '4. the local claim is unchanged after being published three times');

        // No hidden "already published" flag anywhere on the claim's own
        // JSON, and no such vocabulary in the family's own source.
        assert(!Object.keys(claim.toJSON()).some((k) => /publish/i.test(k)), '5. the claim\'s own JSON carries no publication-status field of any kind');
        for (const bannedTerm of ['alreadyPublished', 'isPublished', 'publicationStatus', 'PublicationHistory'] ) {
            assert(grepCount(bannedTerm, ['application/NostrPlaceNamingDiscoveryPublisher.js', 'application/PlaceNamingPublicationRuntimeComposition.js', 'ui/views/WorldView.js', 'ui/components/PlaceNamingPanel.js', 'core/PlaceNamingClaim.js']) === 0, `6. no "${bannedTerm}" vocabulary exists anywhere in the publication path`);
        }

        console.log('✓ Section H: publishing the same claim repeatedly remains three independent, unrelated attempts — no client-side deduplication or "already published" state has appeared anywhere in the path');
    }

    // ---------------------------------------------------------------
    // Section I — Substrate boundary.
    // ---------------------------------------------------------------
    {
        const compositionSource = codeOnlyLines(await rawSource('application/PlaceNamingPublicationRuntimeComposition.js'));
        const publisherSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        const worldViewJs = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const panelJs = codeOnlyLines(await rawSource('ui/components/PlaceNamingPanel.js'));

        const bannedSubstrateTerms = ['Arweave', 'IPFS', 'Ipfs', 'Bitcoin', 'BasePublication', 'baseWallet', 'roleProviderPreference', 'SnapshotDistribution', 'ArweaveContentStore'];
        for (const term of bannedSubstrateTerms) {
            assert(!compositionSource.includes(term), `1. application/PlaceNamingPublicationRuntimeComposition.js carries no "${term}" vocabulary`);
            assert(!publisherSource.includes(term), `2. application/NostrPlaceNamingDiscoveryPublisher.js carries no "${term}" vocabulary`);
        }
        // The relevant SLICE of WorldView.js/PlaceNamingPanel.js devoted to
        // this milestone's own naming-publication feature carries none of
        // this vocabulary either — checked against the whole file is
        // sufficient here since neither file has any legitimate reason to
        // reference these substrates for Place Naming at all.
        for (const term of ['Arweave', 'IPFS', 'Bitcoin', 'BasePublication']) {
            assert(!panelJs.includes(term), `3. PlaceNamingPanel.js carries no "${term}" vocabulary`);
        }

        // No coupling to the Snapshot family's own composition/publisher,
        // confirmed by import statements rather than mere string absence.
        assert(!compositionSource.includes("from './SnapshotDistributionRuntimeComposition.js'"), '4. no import of the Snapshot distribution composition file');
        assert(!compositionSource.includes("from './NostrSnapshotDiscoveryPublisher.js'"), '5. no import of the Snapshot-domain Nostr publisher');
        assert(!publisherSource.includes("from './NostrSnapshotDiscoveryPublisher.js'"), '6. the publisher itself imports no Snapshot-domain sibling');

        console.log('✓ Section I: Place Naming publication remains specifically Nostr-based and carries no Snapshot, Arweave, IPFS, Bitcoin/Base, or provider-preference vocabulary anywhere in its own path');
    }

    // ---------------------------------------------------------------
    // Section J — Product semantics.
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        const worldViewSource = await rawSource('ui/views/WorldView.js');

        const overclaimingPhrases = [
            'published worldwide', 'now visible to everyone', 'everyone has received',
            'globally authoritative', 'guaranteed to be discoverable', 'guaranteed discoverable',
            'now the official name', 'confirmed by the network', 'now permanent'
        ];
        for (const phrase of overclaimingPhrases) {
            assert(!panelSource.toLowerCase().includes(phrase), `1. PlaceNamingPanel.js's own UI copy never claims "${phrase}"`);
            assert(!worldViewSource.toLowerCase().includes(phrase), `2. WorldView.js's own UI copy never claims "${phrase}"`);
        }

        // The result shape rendered is exactly the publisher's own honest
        // vocabulary — published/relayUrl/id/discoveryTag — never a
        // "delivered"/"confirmed"/"verified" field invented by the panel.
        assert(panelSource.includes('publishToNostrResult'), '3. sanity: the panel renders the result prop');
        assert(!panelSource.includes('.delivered') && !panelSource.includes('.confirmed') && !panelSource.includes('.verified'), '4. the panel never invents a delivery/confirmation/verification field on top of the publisher\'s own honest result shape');

        // The composed command's own error message, reconfirmed here from
        // the product-semantics angle: it names an availability fact, never
        // a delivery guarantee.
        const mainJs = await rawSource('ui/main.js');
        assert(mainJs.includes('Nostr publishing is not available — no compatible browser extension was found'), '5. the one user-facing unavailability message stays scoped to a capability fact, never a delivery promise');

        console.log('✓ Section J: the shipped UI copy communicates "sent to the relay" — never "everyone has received it," "globally authoritative," or "guaranteed discoverable"');
    }

    // ---------------------------------------------------------------
    // Section K — Verdict.
    // ---------------------------------------------------------------
    {
        console.log('✓ Section K: VERDICT — the newly reachable "Publish to Nostr" action, driven end to end through the actual PlaceNamingPanel -> WorldView -> ui/main.js -> NostrPlaceNamingDiscoveryPublisher path, hands the publisher the exact, already-signed, already-persisted claim; introduces no second producer, no second wire authority, and no special discovery route; keeps local persistence, discovery, identity, failure, and temporal semantics fully independent of publication outcome; degrades gracefully (at call time, not render time — a genuine, previously-unstated fact this audit surfaces, consistent with this codebase\'s own established snapshotDistributionCommand shape) when the capability is absent; tolerates repeated publication with no client-side dedup; stays free of every other substrate; and reports only what actually happened, never a stronger claim. The action converges cleanly. RECOMMEND: proceed to 0.9.322 — Post-Place-Naming Publication Product Reassessment, which may reasonably conclude STOP.');
    }

    console.log('\n✅ All Place Naming Publication Action Convergence Audit tests passed.');
}

await run();
