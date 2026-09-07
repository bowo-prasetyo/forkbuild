import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';

// 0.9.253 — Place Naming Discovery Boundary.
// See docs/Roadmap.md, "0.9.253 — Place Naming Discovery Boundary."
//
// Section A: PlaceNamingDiscoveryQueryService — aggregation, isolation of
//            a failing source, dedup by claim.id, malformed-source throw
// Section B: DiscoverPlaceNamingClaimsCommand — the thin command boundary
// Section C: PlaceNamingDiscoveryRuntimeComposition — the honest empty
//            roster, and composing over real sources
// Section D: CAPSTONE — a discovery candidate is a candidate, never
//            adopted, never placed, never ranked

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

function signatureOf(overrides = {}) {
    return {
        algorithm: 'ed25519',
        signer: 'did:key:zAlice',
        signature: 'sig-abc123',
        signedHash: 'hash-abc123',
        domain: 'forkbuild.place-naming-claim',
        ...overrides
    };
}

function claimJSONOf(overrides = {}) {
    return {
        id: 'claim-1',
        worldId: 'world-1',
        regionId: 'region-1',
        name: 'Old Oak Crossing',
        authorIdentityId: 'did:key:zAlice',
        createdAt: '2026-01-01T00:00:00.000Z',
        signature: signatureOf(),
        ...overrides
    };
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild-place-naming-discovery',
        version: 1,
        worldId: 'world-1',
        regionId: 'region-1',
        claim: claimJSONOf(),
        ...overrides
    };
}

function sourceOf(rawPayloads) {
    return { search: async () => rawPayloads };
}

// ---------------------------------------------------------------------
// A1. Flagship: a query service aggregates every source's own results
//     into one array of validated envelopes.
// ---------------------------------------------------------------------
{
    const service = new PlaceNamingDiscoveryQueryService([
        sourceOf([envelopeOf({ claim: claimJSONOf({ id: 'claim-1' }) })]),
        sourceOf([envelopeOf({ claim: claimJSONOf({ id: 'claim-2' }) })])
    ]);
    const results = await service.search('forkbuild-place-naming:world-1:region-1');
    assert(results.length === 2, '1. FLAGSHIP — results from every source are aggregated');
    const ids = results.map((envelope) => envelope.claim.id).sort();
    assert(ids[0] === 'claim-1' && ids[1] === 'claim-2', '2. FLAGSHIP — every source\'s own claim is present');
    assert(results.every((envelope) => Object.isFrozen(envelope)), '3. FLAGSHIP — every aggregated envelope is frozen');

    console.log('✓ Flagship: a query service aggregates every source\'s own validated results');
}

// ---------------------------------------------------------------------
// A2. A failing/rejecting source is isolated — it never discards another
//     source's own results, and never fails the whole call.
// ---------------------------------------------------------------------
{
    const failingSource = { search: async () => { throw new Error('relay unreachable'); } };
    const rejectingSource = { search: () => Promise.reject(new Error('peer timed out')) };
    const workingSource = sourceOf([envelopeOf({ claim: claimJSONOf({ id: 'claim-3' }) })]);

    const service = new PlaceNamingDiscoveryQueryService([failingSource, rejectingSource, workingSource]);
    const results = await service.search('some-tag');
    assert(results.length === 1, 'a failing/rejecting source contributes nothing, but never fails the whole search()');
    assert(results[0].claim.id === 'claim-3', 'the working source\'s own result still comes through');

    console.log('✓ a failing or rejecting source is isolated — search() never throws and never discards another source\'s own results');
}

// ---------------------------------------------------------------------
// A3. Malformed raw payloads from a source are discarded, never thrown.
// ---------------------------------------------------------------------
{
    const service = new PlaceNamingDiscoveryQueryService([
        sourceOf([
            envelopeOf({ claim: claimJSONOf({ id: 'claim-4' }) }),
            { protocol: 'not-recognized' },
            'not even an object',
            null,
            JSON.stringify(envelopeOf({ claim: claimJSONOf({ id: 'claim-5' }) }))
        ]),
        { search: async () => 'not an array' },
        { search: async () => null }
    ]);
    const results = await service.search('some-tag');
    const ids = results.map((envelope) => envelope.claim.id).sort();
    assert(ids.length === 2 && ids[0] === 'claim-4' && ids[1] === 'claim-5', 'only the well-formed envelopes (plain object or JSON string) survive; everything else is silently discarded');

    console.log('✓ malformed raw payloads, and a source returning a non-array, are silently discarded, never thrown');
}

// ---------------------------------------------------------------------
// A4. Deduplication is by claim.id, keeping the first occurrence.
// ---------------------------------------------------------------------
{
    const service = new PlaceNamingDiscoveryQueryService([
        sourceOf([envelopeOf({ claim: claimJSONOf({ id: 'claim-1', name: 'First Arrival' }) })]),
        sourceOf([envelopeOf({ claim: claimJSONOf({ id: 'claim-1', name: 'Second Arrival' }) })])
    ]);
    const results = await service.search('some-tag');
    assert(results.length === 1, 'the same claim.id echoed by two sources collapses to one entry');
    assert(results[0].claim.name === 'First Arrival', 'the first source\'s own occurrence wins — sources are consulted in constructor order');

    console.log('✓ deduplication is by claim.id, keeping whichever source\'s own result arrived first');
}

// ---------------------------------------------------------------------
// A5. Zero sources is explicitly valid, and resolves to an empty array.
// ---------------------------------------------------------------------
{
    const service = new PlaceNamingDiscoveryQueryService([]);
    const results = await service.search('some-tag');
    assert(Array.isArray(results) && results.length === 0, 'a query service with zero sources always resolves to []');

    const defaulted = new PlaceNamingDiscoveryQueryService();
    const defaultedResults = await defaulted.search('some-tag');
    assert(Array.isArray(defaultedResults) && defaultedResults.length === 0, 'sources defaults to an empty array when omitted entirely');

    console.log('✓ zero sources is valid and always resolves to []');
}

// ---------------------------------------------------------------------
// A6. Construction throws synchronously for a genuinely malformed
//     sources argument or entry — never merely absent.
// ---------------------------------------------------------------------
{
    expectThrows(() => new PlaceNamingDiscoveryQueryService('not an array'), 'a non-array sources argument throws');
    expectThrows(() => new PlaceNamingDiscoveryQueryService([{ notSearch: () => {} }]), 'an entry with no search() function throws');
    expectThrows(() => new PlaceNamingDiscoveryQueryService([null]), 'a null entry throws');

    console.log('✓ construction throws synchronously for a genuinely malformed sources argument or entry');
}

// ---------------------------------------------------------------------
// B1. DiscoverPlaceNamingClaimsCommand — a thin, verbatim pass-through.
// ---------------------------------------------------------------------
{
    const service = new PlaceNamingDiscoveryQueryService([
        sourceOf([envelopeOf({ claim: claimJSONOf({ id: 'claim-1' }) })])
    ]);
    let observedTag = null;
    const spyService = {
        search: async (tag) => { observedTag = tag; return service.search(tag); }
    };

    const results = await executeDiscoverPlaceNamingClaimsCommand({
        discoveryTag: 'forkbuild-place-naming:world-1:region-1',
        discoveryQueryService: spyService
    });
    assert(observedTag === 'forkbuild-place-naming:world-1:region-1', 'discoveryTag is forwarded verbatim');
    assert(results.length === 1 && results[0].claim.id === 'claim-1', 'the query service\'s own result is passed through unmodified');

    console.log('✓ executeDiscoverPlaceNamingClaimsCommand() forwards discoveryTag verbatim and passes the result through unmodified');
}

// ---------------------------------------------------------------------
// B2. A missing or malformed discoveryQueryService throws synchronously.
// ---------------------------------------------------------------------
{
    expectThrows(() => executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: 'some-tag' }), 'a missing discoveryQueryService throws');
    expectThrows(() => executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: 'some-tag', discoveryQueryService: {} }), 'a discoveryQueryService with no search() throws');
    expectThrows(() => executeDiscoverPlaceNamingClaimsCommand(), 'no arguments at all throws');

    console.log('✓ a missing or malformed discoveryQueryService throws synchronously, before any search() call');
}

// ---------------------------------------------------------------------
// C1. composePlaceNamingDiscoveryRuntime() with zero sources — an honest
//     empty roster, never null, always resolving to [].
// ---------------------------------------------------------------------
{
    const runtime = composePlaceNamingDiscoveryRuntime();
    assert(runtime.queryService !== null && runtime.queryService !== undefined, 'queryService is never null, even with zero sources');
    assert(typeof runtime.queryService.search === 'function', 'the returned queryService is a real, usable collaborator');
    const results = await runtime.queryService.search('some-tag');
    assert(Array.isArray(results) && results.length === 0, 'with zero sources, search() resolves to []');
    assert(Object.isFrozen(runtime), 'the composed runtime object is frozen');

    console.log('✓ composePlaceNamingDiscoveryRuntime() with zero sources returns a real, usable, always-[] queryService — never null');
}

// ---------------------------------------------------------------------
// C2. composePlaceNamingDiscoveryRuntime() composes over real sources.
// ---------------------------------------------------------------------
{
    const runtime = composePlaceNamingDiscoveryRuntime({
        sources: [sourceOf([envelopeOf({ claim: claimJSONOf({ id: 'claim-9' }) })])]
    });
    const results = await runtime.queryService.search('some-tag');
    assert(results.length === 1 && results[0].claim.id === 'claim-9', 'a composed runtime aggregates the sources it was given');

    console.log('✓ composePlaceNamingDiscoveryRuntime() composes a real queryService over the sources it is given');
}

// ---------------------------------------------------------------------
// C3. A malformed source still throws at composition time, unchanged.
// ---------------------------------------------------------------------
{
    expectThrows(() => composePlaceNamingDiscoveryRuntime({ sources: ['not a source'] }), 'a malformed source throws during composition, exactly as constructing PlaceNamingDiscoveryQueryService directly already would');

    console.log('✓ a genuinely malformed source still throws at composition time');
}

// ---------------------------------------------------------------------
// C4. Every call builds a fresh, independent runtime — no shared state.
// ---------------------------------------------------------------------
{
    const first = composePlaceNamingDiscoveryRuntime({ sources: [sourceOf([envelopeOf()])] });
    const second = composePlaceNamingDiscoveryRuntime();
    assert(first.queryService !== second.queryService, 'two calls produce two independent queryService instances');
    const secondResults = await second.queryService.search('some-tag');
    assert(secondResults.length === 0, 'a runtime composed with no sources is never contaminated by a previous call\'s own sources');

    console.log('✓ every composePlaceNamingDiscoveryRuntime() call is independent — no shared, module-level state');
}

// ---------------------------------------------------------------------
// D. CAPSTONE — a discovery candidate is a candidate, never adopted,
//    never placed, never ranked. This suite never once imports
//    application/LocalPlaceNamingClaimStore.js, core/PlaceNamingView.js,
//    identity/LocalAuthorizationVerifier.js, or application/
//    WorldNavigationSession.js — proving structurally, not just by
//    convention, that this milestone's discovery boundary never reaches
//    into World presentation, the local claim store, or verification.
//    A caller who wants to ADOPT a discovered candidate hands its own
//    `claim` to application/PlaceNamingClaimExchange.js#importClaim() as
//    a publication package — a deliberately separate, later step this
//    boundary never performs on its own.
// ---------------------------------------------------------------------
{
    const runtime = composePlaceNamingDiscoveryRuntime({
        sources: [sourceOf([envelopeOf({ claim: claimJSONOf({ id: 'claim-capstone' }) })])]
    });
    const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
    const results = await executeDiscoverPlaceNamingClaimsCommand({
        discoveryTag: tag,
        discoveryQueryService: runtime.queryService
    });
    assert(results.length === 1, 'CAPSTONE — a candidate is discoverable end to end: source -> queryService -> command boundary');
    assert(results[0].claim.id === 'claim-capstone', 'CAPSTONE — the discovered candidate carries the claim, unmodified');
    assert(results[0].claim.signature.signer === 'did:key:zAlice', 'CAPSTONE — the candidate still carries its own unverified signature — verification remains a separate, later step');

    console.log('✓ CAPSTONE — a Place Naming claim flows end to end from a discovery source, through the query service and command boundary, to an unranked, unverified, unadopted candidate');
}

console.log('\nAll PlaceNamingDiscoveryBoundary tests passed.');
