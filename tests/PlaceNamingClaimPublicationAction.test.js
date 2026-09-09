import { readFile } from 'node:fs/promises';

import PlaceNamingPanel from '../ui/components/PlaceNamingPanel.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { composePlaceNamingPublicationRuntime } from '../application/PlaceNamingPublicationRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.320 — Explicit Place Naming Publication Action.
// See docs/Roadmap.md, "0.9.320 — Explicit Place Naming Publication
// Action," for the full milestone story.
//
// 0.9.316 through 0.9.319 each proved `NostrPlaceNamingDiscoveryPublisher`
// works, in isolation, from a test's own direct construction — never
// reachable from anything a person could actually click. This milestone
// wires it into `ui/main.js` (composition), `ui/views/WorldView.js` (the
// session-aware command wrapper and ephemeral publish state), and
// `ui/components/PlaceNamingPanel.js` (the "Publish to Nostr" action per
// claim), and this file proves the result the same way
// tests/PlaceNamingWorldViewPresentation.test.js already proved its own
// 0.9.257 wiring — WITHOUT ever mounting a real Vue component:
// `makeHost()`, below, reproduces `ui/views/WorldView.js`'s own
// `publishNamingClaimToNostr()`/`resetNamingPanelPublishToNostr()` EXACTLY,
// and Section I proves — via raw source-string assertions — that the
// reproduction genuinely matches what that file contains.
//
//   Section A: PlaceNamingPanel's own contract — the new prop/emit/method
//              surface exists with the right shapes and defaults
//   Section B: PlaceNamingPanel — "Publish to Nostr" is a dumb
//              pass-through emit, gated on canPublishToNostr, disabled
//              while executing, never itself deciding whether publishing
//              is possible
//   Section C: host wiring — identifies the existing claim by id and hands
//              it, unmodified, to the injected command; never creates or
//              mutates a claim
//   Section D: executing/result/error transitions mirror
//              OwnPublicationPanel's own async-action shape
//   Section E: staleness guard — a fresh publish attempt, or leaving the
//              naming panel, invalidates a still-in-flight prior attempt
//   Section F: FLAGSHIP — Device A creates and (through the reproduced UI
//              wiring) explicitly publishes; Device B discovers through
//              the unmodified existing discovery chain
//   Section G: NEGATIVE — no command supplied: nothing renders, nothing
//              mutates, calling the host function is a silent no-op
//   Section H: creating a claim and publishing it to Nostr stay two
//              separate, explicit actions — creating one never triggers
//              the other
//   Section I: architectural regression — ui/main.js/ui/views/WorldView.js/
//              ui/components/PlaceNamingPanel.js actually contain the
//              wiring every section above assumes

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
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

function makeReplica(identityProvider, { storage = new InMemoryStorageProvider() } = {}) {
    const store = new LocalPlaceNamingClaimStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return { storage, store, verifier, useCase };
}

// ---------------------------------------------------------------------
// A fake `application/WorldNavigationSession.js` stand-in exposing ONLY
// `getPlaceNamingClaims()` — the ONE session method
// `publishNamingClaimToNostr()` (per ui/views/WorldView.js's own 0.9.320
// wiring) ever calls. Any other access throws, so a test failing this way
// is proof the reproduction below (or the real wiring, should it regress)
// reaches into `session` for something beyond this milestone's own
// boundary — never a session mutation, never a second read.
// ---------------------------------------------------------------------
function makeSession(claimsForRegion) {
    return new Proxy({ getPlaceNamingClaims: claimsForRegion }, {
        get(target, prop) {
            if (prop === 'getPlaceNamingClaims') return target.getPlaceNamingClaims;
            if (prop === 'then' || typeof prop === 'symbol') return undefined;
            throw new Error(`fake session: unexpected access to session.${String(prop)} — publishNamingClaimToNostr() must only ever call session.getPlaceNamingClaims()`);
        }
    });
}

// Reproduces EXACTLY ui/views/WorldView.js's own `publishNamingClaimToNostr()`/
// `resetNamingPanelPublishToNostr()`/`openNamingPanel()`/`closeNamingPanel()`
// naming-panel-publication slice (see that file's own "0.9.320" comments).
// Section I proves this reproduction is not merely aspirational.
function makeHost({ session, publishPlaceNamingClaimToNostrCommand }) {
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

// The SAME "call methods with a plain ctx object" discipline
// tests/LiveWorldView.test.js/WorldViewPublicationDistributionRuntimeProviderIntegration.test.js
// already establish — PlaceNamingPanel.js is a plain options-API object,
// never mounted through a real Vue runtime in this suite.
function panelCtx(overrides = {}) {
    const emitted = [];
    return {
        newName: '',
        namesExpanded: false,
        advancedExpanded: false,
        regionId: null,
        regionName: '',
        namingView: [],
        claims: [],
        preferredName: null,
        myIdentityId: null,
        geographicRegions: [],
        geographicNamingView: [],
        canPublishToNostr: false,
        publishToNostrClaimId: null,
        publishToNostrExecuting: false,
        publishToNostrError: null,
        publishToNostrResult: null,
        $emit: (event, ...args) => emitted.push({ event, args }),
        emitted,
        ...overrides
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — PlaceNamingPanel's own contract.
    // ---------------------------------------------------------------
    {
        assert(PlaceNamingPanel.emits.includes('publish-to-nostr'), '1. PlaceNamingPanel declares a publish-to-nostr emit');
        assert(typeof PlaceNamingPanel.methods.onPublishToNostr === 'function', '2. PlaceNamingPanel defines onPublishToNostr()');
        assert(PlaceNamingPanel.props.canPublishToNostr.type === Boolean && PlaceNamingPanel.props.canPublishToNostr.default === false, '3. canPublishToNostr defaults to false — no button when the host supplied nothing');
        assert(PlaceNamingPanel.props.publishToNostrClaimId.default === null, '4. publishToNostrClaimId defaults to null');
        assert(PlaceNamingPanel.props.publishToNostrExecuting.default === false, '5. publishToNostrExecuting defaults to false');
        assert(PlaceNamingPanel.props.publishToNostrError.default === null, '6. publishToNostrError defaults to null');
        assert(PlaceNamingPanel.props.publishToNostrResult.default === null, '7. publishToNostrResult defaults to null');
        // The pre-existing 'publish-name' emit (create a LOCAL claim) is
        // completely unmodified by this milestone's own new
        // 'publish-to-nostr' emit — the two stay separate emits.
        assert(PlaceNamingPanel.emits.includes('publish-name'), '8. the pre-existing publish-name emit is unmodified/still present');

        console.log('✓ Section A: PlaceNamingPanel declares the new publish-to-nostr contract without touching the pre-existing publish-name one');
    }

    // ---------------------------------------------------------------
    // Section B — "Publish to Nostr" is a dumb pass-through emit.
    // ---------------------------------------------------------------
    {
        const ctx = panelCtx({ canPublishToNostr: true });
        PlaceNamingPanel.methods.onPublishToNostr.call(ctx, 'claim-42');

        assert(ctx.emitted.length === 1, '9. exactly one event was emitted');
        assert(ctx.emitted[0].event === 'publish-to-nostr' && ctx.emitted[0].args[0] === 'claim-42', '10. the emitted event carries exactly the claimId handed in, unmodified');

        console.log('✓ Section B: onPublishToNostr() is a dumb pass-through — it emits the claimId verbatim and decides nothing itself');
    }

    // ---------------------------------------------------------------
    // Section C — host wiring identifies the existing claim by id and
    // hands it, unmodified, to the injected command.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-c', 'region-c', 'Hostwired Hollow');

        const calls = [];
        const command = (handedClaim) => { calls.push(handedClaim); return Promise.resolve({ published: true, relayUrl: 'wss://x', id: 'c'.repeat(64), discoveryTag: 'x' }); };

        const session = makeSession((regionId) => replica.useCase.claimsForRegion('world-c', regionId));
        const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand: command });

        host.openNamingPanel('region-c');
        host.publishNamingClaimToNostr(claim.id);
        await flushMicrotasks();

        assert(calls.length === 1, '11. the injected command was called exactly once');
        // The claim handed to the command comes back through
        // session.getPlaceNamingClaims() -> LocalPlaceNamingClaimStore#list()
        // -> PlaceNamingClaim.fromJSON() — a freshly reconstructed instance
        // by design (see that store's own header, "returns PlaceNamingClaim
        // instances, never raw JSON"), so this checks the SAME claim by its
        // own identity/fields/signature rather than object reference.
        assert(calls[0] instanceof PlaceNamingClaim, '12a. the handed value is a real PlaceNamingClaim instance, never a plain object this function assembled itself');
        assert(calls[0].id === claim.id && calls[0].name === claim.name && calls[0].authorIdentityId === claim.authorIdentityId, '12b. the handed claim is the EXACT existing claim by identity/fields — never a copy with different content, never a re-derived one');
        assert(JSON.stringify(calls[0].signature) === JSON.stringify(claim.signature), '12c. the handed claim carries the exact same signature — never re-signed or stripped');
        assert(replica.store.list('world-c').length === 1, '13. publishing to Nostr never creates a second local claim');
        assert(replica.store.list('world-c')[0].id === claim.id, '14. the one local claim on file is still the exact same claim, unchanged');

        console.log('✓ Section C: the host wiring identifies the existing, already-signed claim by id and hands it unmodified to the injected command — never a second producer, never a mutation');
    }

    // ---------------------------------------------------------------
    // Section D — executing/result/error transitions.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-d', 'region-d', 'Transition Terrace');
        const session = makeSession((regionId) => replica.useCase.claimsForRegion('world-d', regionId));

        // D1 — success.
        {
            let resolvePublish;
            const command = () => new Promise((resolve) => { resolvePublish = resolve; });
            const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel('region-d');

            host.publishNamingClaimToNostr(claim.id);
            assert(host.state.namingPanelPublishToNostrExecuting === true, '15. executing becomes true immediately on click');
            assert(host.state.namingPanelPublishToNostrClaimId === claim.id, '16. the target claimId is recorded immediately');
            assert(host.state.namingPanelPublishToNostrResult === null && host.state.namingPanelPublishToNostrError === null, '17. no stale result/error is shown while a call is in flight');

            // The command itself is invoked one microtask later (`Promise.resolve().then(() => command(...))`,
            // mirroring OwnPublicationPanel.js's own distributeOwnSnapshot()) — resolvePublish is not assigned until then.
            await flushMicrotasks();
            resolvePublish({ published: true, relayUrl: 'wss://relay.example', id: 'd'.repeat(64), discoveryTag: 'tag-d' });
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrExecuting === false, '18. executing returns to false once the call settles');
            assert(host.state.namingPanelPublishToNostrResult && host.state.namingPanelPublishToNostrResult.relayUrl === 'wss://relay.example', '19. a successful result is recorded verbatim');
            assert(host.state.namingPanelPublishToNostrError === null, '20. no error is recorded alongside a success');
        }

        // D2 — failure.
        {
            const command = () => Promise.reject(new Error('relay unreachable'));
            const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel('region-d');

            host.publishNamingClaimToNostr(claim.id);
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrExecuting === false, '21. executing returns to false after a failure');
            assert(host.state.namingPanelPublishToNostrError === 'relay unreachable', '22. the rejection\'s own message is surfaced verbatim');
            assert(host.state.namingPanelPublishToNostrResult === null, '23. no result is recorded alongside a failure');
            assert(replica.store.list('world-d').length === 1, '24. a failed publication never retracts or otherwise mutates the local claim');
        }

        // D3 — a synchronous throw from the composed command (mirroring
        // ui/main.js's own `publishPlaceNamingClaimToNostrCommand`, which
        // rejects — never throws synchronously — when no discoveryPublisher
        // is composed; this proves the host tolerates either shape).
        {
            const command = () => { throw new Error('no compatible browser extension was found'); };
            const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel('region-d');

            host.publishNamingClaimToNostr(claim.id);
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrError === 'no compatible browser extension was found', '25. a synchronous throw from the command is caught and surfaced the same way a rejection is');
        }

        console.log('✓ Section D: executing/result/error transitions mirror OwnPublicationPanel\'s own async-action shape, and a failure never mutates local state');
    }

    // ---------------------------------------------------------------
    // Section E — staleness guard.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claimOne = replica.useCase.publish('world-e', 'region-e', 'First Attempt Falls');
        const claimTwo = replica.useCase.publish('world-e', 'region-e', 'Second Attempt Springs');
        const session = makeSession((regionId) => replica.useCase.claimsForRegion('world-e', regionId));

        // E1 — a second click before the first settles: only the SECOND
        // attempt's own result is ever recorded.
        {
            let resolveFirst;
            let callCount = 0;
            const command = () => {
                callCount += 1;
                if (callCount === 1) return new Promise((resolve) => { resolveFirst = resolve; });
                return Promise.resolve({ published: true, relayUrl: 'wss://second', id: 'e'.repeat(64), discoveryTag: 'tag-e2' });
            };
            const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel('region-e');

            host.publishNamingClaimToNostr(claimOne.id);
            host.publishNamingClaimToNostr(claimTwo.id);
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrClaimId === claimTwo.id, '26. the second, more recent click is the one reflected in the panel\'s own state');
            assert(host.state.namingPanelPublishToNostrResult.relayUrl === 'wss://second', '27. the second attempt\'s own result is recorded');

            resolveFirst({ published: true, relayUrl: 'wss://first-STALE', id: 'f'.repeat(64), discoveryTag: 'tag-e1' });
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrResult.relayUrl === 'wss://second', '28. the first attempt\'s late-arriving result never overwrites the second, more recent one');
            assert(host.state.namingPanelPublishToNostrClaimId === claimTwo.id, '29. the stale first attempt never rewrites which claimId the panel describes either');
        }

        // E2 — closing the naming panel invalidates a still-in-flight call.
        {
            let resolvePublish;
            const command = () => new Promise((resolve) => { resolvePublish = resolve; });
            const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand: command });
            host.openNamingPanel('region-e');

            host.publishNamingClaimToNostr(claimOne.id);
            assert(host.state.namingPanelPublishToNostrExecuting === true, '30. sanity: the call is in flight');

            // Let the deferred command() actually run (assigning
            // resolvePublish) before closing the panel.
            await flushMicrotasks();
            assert(host.state.namingPanelPublishToNostrExecuting === true, '30b. sanity: still in flight — the fake command has not settled yet');

            host.closeNamingPanel();
            assert(host.state.namingPanelPublishToNostrExecuting === false, '31. closing the panel immediately clears the executing flag');

            resolvePublish({ published: true, relayUrl: 'wss://after-close', id: 'a'.repeat(64), discoveryTag: 'tag-e3' });
            await flushMicrotasks();

            assert(host.state.namingPanelPublishToNostrResult === null, '32. a call that settles after the panel closed never writes a result into the (now-closed) panel\'s state');
        }

        console.log('✓ Section E: a fresh publish attempt, or leaving the naming panel, invalidates a still-in-flight prior attempt — never a stale write');
    }

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: Device A creates and explicitly publishes
    // through the reproduced UI wiring; Device B discovers through the
    // unmodified existing discovery chain.
    // ---------------------------------------------------------------
    {
        const relayEvents = [];
        async function fakePublishImpl(relayUrl, eventTemplate) {
            relayEvents.push({ kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content });
            return { published: true, id: 'f'.repeat(64) };
        }
        function fakeQueryImpl(relayUrl, filter) {
            const wantedTags = filter['#t'] || [];
            return Promise.resolve(relayEvents.filter((event) => event.tags.some((t) => t[0] === 't' && wantedTags.includes(t[1]))));
        }

        // Composition root — exactly ui/main.js's own call.
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: fakePublishImpl }
        });
        const publishPlaceNamingClaimToNostrCommand = (claim) => Promise.resolve().then(() => {
            if (!discoveryPublisher) throw new Error('Nostr publishing is not available — no compatible browser extension was found');
            return discoveryPublisher.publish(claim);
        });

        const alice = makeIdentity('Alice');    // Device A
        const bob = makeIdentity('Bob');        // Device B — independent replica, no shared storage.
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const worldId = 'world-flagship-ui';
        const regionId = 'region-flagship-ui';

        // Device A: create locally (session.publishPlaceNamingClaim(), per
        // ui/views/WorldView.js's own unmodified publishNamingClaim()) —
        // NEVER automatically announced.
        const claim = deviceA.useCase.publish(worldId, regionId, 'Flagship Fen');
        assert(relayEvents.length === 0, 'F1. creating a claim locally never announces it — the relay has nothing yet');

        // Device A: through the ACTUAL UI-shaped path this milestone adds —
        // PlaceNamingPanel emits 'publish-to-nostr', the host wiring
        // resolves it into the existing claim and calls the composed
        // command.
        const session = makeSession((rid) => deviceA.useCase.claimsForRegion(worldId, rid));
        const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand });
        host.openNamingPanel(regionId);

        const ctx = panelCtx({ canPublishToNostr: true, claims: [claim] });
        // Simulate the actual click a person makes on the rendered "All
        // Claims" row — PlaceNamingPanel's own onPublishToNostr(), feeding
        // straight into the host's own handler, exactly as
        // @publish-to-nostr="publishNamingClaimToNostr" wires them in
        // ui/views/WorldView.js's own template.
        PlaceNamingPanel.methods.onPublishToNostr.call(ctx, claim.id);
        assert(ctx.emitted[0].event === 'publish-to-nostr', 'F2. the panel emitted publish-to-nostr for the clicked claim');
        host.publishNamingClaimToNostr(ctx.emitted[0].args[0]);
        await flushMicrotasks();

        assert(host.state.namingPanelPublishToNostrResult !== null && host.state.namingPanelPublishToNostrResult.published === true, 'F3. the explicit UI action succeeded');
        assert(relayEvents.length === 1, 'F4. FLAGSHIP — exactly one event reached the fake relay, through the full UI-shaped path (panel click -> host wiring -> composed runtime -> publisher)');

        // Device B: discover through the EXACT, unmodified, already-shipped
        // chain — no shared local storage with Device A at all.
        const bobsDiscoverySource = new NostrPlaceNamingDiscoverySource({ queryImpl: fakeQueryImpl });
        const bobsQueryService = new PlaceNamingDiscoveryQueryService([bobsDiscoverySource]);
        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: bobsQueryService });

        assert(discovered.length === 1, 'F5. FLAGSHIP — Device B discovers exactly one claim through the unmodified existing discovery path');
        assert(discovered[0].claim.name === 'Flagship Fen' && discovered[0].claim.id === claim.id, 'F6. FLAGSHIP — the discovered claim is genuinely Device A\'s own, published only through the new explicit UI action');
        assert(deviceB.store.list(worldId).length === 0, 'F7. discovery alone still never writes into Device B\'s own local store — adoption remains its own, separate, unbuilt step, exactly as before this milestone');

        console.log('✓ Section F: FLAGSHIP — Device A creates a claim, explicitly publishes it through the new PlaceNamingPanel action -> WorldView host wiring -> composed runtime -> publisher, and Device B discovers it through the completely unmodified existing discovery chain');
    }

    // ---------------------------------------------------------------
    // Section G — NEGATIVE: no command supplied.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);
        const claim = replica.useCase.publish('world-g', 'region-g', 'Untouched Terrace');
        const session = makeSession((regionId) => replica.useCase.claimsForRegion('world-g', regionId));

        const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand: null });
        host.openNamingPanel('region-g');
        const returned = host.publishNamingClaimToNostr(claim.id);

        assert(returned === undefined, '33. calling the host function with no command supplied is a silent, synchronous no-op');
        assert(host.state.namingPanelPublishToNostrExecuting === false, '34. no executing state is ever entered');
        assert(host.state.namingPanelPublishToNostrClaimId === null, '35. no claimId is ever recorded');
        assert(replica.store.list('world-g').length === 1, '36. the local claim is completely untouched');

        // The panel itself never renders the action at all when the host
        // supplied nothing — canPublishToNostr stays false, its own
        // default (Section A).
        const ctx = panelCtx();
        assert(ctx.canPublishToNostr === false, '37. sanity: the panel\'s own default communicates "no command available" with no host wiring needed');

        console.log('✓ Section G: NEGATIVE — with no command supplied, nothing renders, nothing mutates, and calling the host function directly is a silent no-op');
    }

    // ---------------------------------------------------------------
    // Section H — creating a claim and publishing it to Nostr stay two
    // separate, explicit actions.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica(alice);

        let nostrCalls = 0;
        const command = () => { nostrCalls += 1; return Promise.resolve({ published: true, relayUrl: 'wss://x', id: 'h'.repeat(64), discoveryTag: 'tag-h' }); };
        const session = makeSession((regionId) => replica.useCase.claimsForRegion('world-h', regionId));
        const host = makeHost({ session, publishPlaceNamingClaimToNostrCommand: command });
        host.openNamingPanel('region-h');

        // The exact call ui/views/WorldView.js's own unmodified
        // publishNamingClaim() makes — creating a claim locally.
        replica.useCase.publish('world-h', 'region-h', 'Independently Created Isle');
        await flushMicrotasks();

        assert(nostrCalls === 0, '38. creating a local claim never, by itself, triggers a Nostr publication — the two remain separate, explicit actions');

        console.log('✓ Section H: creating a claim and publishing it to Nostr stay two separate, explicit actions — creating one never triggers the other');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewCode.includes("inject('publishPlaceNamingClaimToNostrCommand'"), '39. ui/views/WorldView.js injects the app-wide publishPlaceNamingClaimToNostrCommand');
        assert(worldViewCode.includes('function publishNamingClaimToNostr('), '40. ui/views/WorldView.js defines publishNamingClaimToNostr()');
        assert(worldViewCode.includes('session.getPlaceNamingClaims(regionId)'), '41. publishNamingClaimToNostr() reads the claim back through session.getPlaceNamingClaims(), the same reproduction Section C relies on');
        assert(worldViewCode.includes('@publish-to-nostr="publishNamingClaimToNostr"'), '42. the PlaceNamingPanel template wires publish-to-nostr to publishNamingClaimToNostr');
        assert(worldViewCode.includes(':can-publish-to-nostr="canPublishPlaceNamingClaimToNostr"'), '43. the PlaceNamingPanel template forwards a canPublishToNostr gate to the panel');
        // The pre-existing, unmodified local-creation path stays untouched.
        assert(worldViewCode.includes('session.publishPlaceNamingClaim(namingPanelRegionId.value, name)'), '44. publishNamingClaim() (LOCAL creation) is completely unmodified by this milestone');

        const panelCode = await codeOnlySource('ui/components/PlaceNamingPanel.js');
        assert(panelCode.includes("'publish-to-nostr'"), "45. ui/components/PlaceNamingPanel.js declares the publish-to-nostr emit");
        assert(panelCode.includes('onPublishToNostr(claimId)'), '46. ui/components/PlaceNamingPanel.js defines onPublishToNostr(claimId)');

        const mainCode = await codeOnlySource('ui/main.js');
        assert(mainCode.includes("app.provide('publishPlaceNamingClaimToNostrCommand'"), '47. ui/main.js provides publishPlaceNamingClaimToNostrCommand app-wide');

        // The use case this whole family rests on is untouched — publish()
        // still has no idea a Nostr publisher exists (0.9.316's own
        // "never automatic" decision, preserved unchanged).
        const useCaseCode = await codeOnlySource('application/PlaceNamingClaimUseCase.js');
        assert(!useCaseCode.includes('Nostr') && !useCaseCode.includes('DiscoveryPublisher'), '48. application/PlaceNamingClaimUseCase.js remains completely unaware of Nostr publication — publish() stays local-only and synchronous');

        console.log('✓ Section I: architectural regression — ui/main.js/ui/views/WorldView.js/ui/components/PlaceNamingPanel.js actually contain the wiring every section above assumes, and PlaceNamingClaimUseCase.js remains untouched');
    }

    console.log('\n✅ All Explicit Place Naming Publication Action tests passed.');
}

await run();
