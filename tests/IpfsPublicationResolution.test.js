import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION as ATTRIBUTION_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';

import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { buildPlaceNamingClaimPublication, PLACE_NAMING_CLAIM_PUBLICATION_KIND, CURRENT_SCHEMA_VERSION as NAMING_SCHEMA_VERSION } from '../application/PlaceNamingClaimPublication.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { createPlaceNamingClaimPublicationKind } from '../application/PlaceNamingClaimPublicationKind.js';

// 0.7.1 — IPFS Content Publication & Resolution.
//
// The flagship this milestone's own design conversation asked for
// directly: TWO differently-shaped content kinds (a self-describing
// BlueprintAttribution, a wrapped PlaceNamingClaim), published by Alice
// and resolved by Bob through the SAME PublicationResolver instance
// type, wired to content/IpfsContentStore.js instead of content/
// LocalContentStore.js — no IpfsBlueprintAttributionResolver, no
// IpfsPlaceNamingResolver, exactly as demanded. Every node in this file
// is a fake, injected Kubo HTTP API (see makeFakeIpfsNode() below) —
// deterministic and network-free, the same technique tests/
// IpfsContentStore.test.js already established; tests/
// IpfsLiveIntegration.test.js is the one file that ever touches a real
// daemon.
//
// "Replication" is modeled the only way a deterministic, in-process test
// honestly can without a live daemon: two fake nodes sharing the same
// backing Map have "already synced" a CID; two fake nodes with SEPARATE
// Maps have not. Alice's and Bob's fake nodes below share one Map (Bob
// "has already replicated" everything Alice published); Carol's fake
// node starts with an EMPTY, unrelated Map and only gains the content
// partway through the flagship — demonstrating the exact property the
// design conversation named: "the publication points to content, not to
// Alice's device."
//
// See docs/Principles.md, "Availability Is Not Validity (0.7.1)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
    return provider;
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// A fake Kubo HTTP RPC API backed by whatever `network` Map is handed
// in — see this file's own header for what sharing (or not sharing) one
// Map between two fake nodes represents.
function makeFakeIpfsNode(network) {
    return async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) {
                return new Response('block not found locally', { status: 500 });
            }
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    };
}

async function run() {
    const sharedNetwork = new Map(); // Alice's and Bob's nodes — already "in sync"
    const carolsNetwork = new Map(); // Carol's node — starts with nothing

    const alice = makeIdentity('Alice');
    const aliceResolver = new PublicationResolver(
        new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: makeFakeIpfsNode(sharedNetwork) }),
        new LocalAuthorizationVerifier()
    );

    const bobVerifier = new LocalAuthorizationVerifier();
    const bobAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());
    const bobNamingStore = new LocalPlaceNamingClaimStore(new InMemoryStorageProvider());
    const bobResolver = new PublicationResolver(
        new IpfsContentStore({ apiUrl: 'http://bob-node.test:5001', fetchImpl: makeFakeIpfsNode(sharedNetwork) }),
        bobVerifier
    );

    const carolResolver = new PublicationResolver(
        new IpfsContentStore({ apiUrl: 'http://carol-node.test:5001', fetchImpl: makeFakeIpfsNode(carolsNetwork) }),
        new LocalAuthorizationVerifier()
    );

    // ---------------------------------------------------------------
    // Alice publishes a BlueprintAttribution ...
    // ---------------------------------------------------------------
    let attribution = new BlueprintAttribution({ fingerprint: 'bp:farmstead-1', authorIdentityId: alice.getSigningIdentity().id });
    attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));
    const attributionPublication = await aliceResolver.publish({
        content: attribution,
        contentKind: BLUEPRINT_ATTRIBUTION_KIND,
        contentSchemaVersion: ATTRIBUTION_SCHEMA_VERSION,
        identityProvider: alice
    });
    console.log('✓ Alice published a BlueprintAttribution to her own IPFS node');

    // ---------------------------------------------------------------
    // ... and a PlaceNamingClaim — a completely different content
    // shape (wrapped, not self-describing) through the identical
    // publish() call.
    // ---------------------------------------------------------------
    let namingClaim = new PlaceNamingClaim({
        worldId: 'world-1', regionId: 'region-green-valley', name: 'Green Valley',
        authorIdentityId: alice.getSigningIdentity().id
    });
    namingClaim = namingClaim.withSignature(alice.signCanonical(namingClaim.getSigningDescriptor()));
    const namingPublication = await aliceResolver.publish({
        content: buildPlaceNamingClaimPublication(namingClaim),
        contentKind: PLACE_NAMING_CLAIM_PUBLICATION_KIND,
        contentSchemaVersion: NAMING_SCHEMA_VERSION,
        identityProvider: alice
    });
    console.log('✓ Alice published a PlaceNamingClaim to the same IPFS node');

    assert(attributionPublication.contentReference.uri !== namingPublication.contentReference.uri,
        '1. two different content kinds get two different CIDs');

    // The portable envelopes — this is what would actually cross a
    // rendezvous relay, a pasted file, or a real IPFS pointer to reach
    // Bob.
    const attributionJson = attributionPublication.toJSON();
    const namingJson = namingPublication.toJSON();

    // ---------------------------------------------------------------
    // Bob resolves BOTH through the SAME PublicationResolver type —
    // only the kindPlugin differs, never the resolver, never the
    // ContentStore implementation.
    // ---------------------------------------------------------------
    const attributionKind = createBlueprintAttributionPublicationKind({ verifier: bobVerifier, store: bobAttributionStore });
    const namingKind = createPlaceNamingClaimPublicationKind({ verifier: bobVerifier, store: bobNamingStore });

    const attributionResult = await bobResolver.resolve(attributionJson, attributionKind);
    assert(attributionResult.outcome === PublicationResolutionOutcome.RESOLVED, '2. Bob resolves the attribution');
    assert(attributionResult.content.attribution.fingerprint === 'bp:farmstead-1', '3. resolved attribution carries the correct fingerprint');
    assert(bobAttributionStore.has('bp:farmstead-1', attribution.id), '4. the attribution is now in Bob\'s own store');

    const namingResult = await bobResolver.resolve(namingJson, namingKind);
    assert(namingResult.outcome === PublicationResolutionOutcome.RESOLVED, '5. Bob resolves the naming claim');
    assert(namingResult.content.claim.name === 'Green Valley', '6. resolved claim carries the correct name');
    assert(bobNamingStore.has('world-1', namingClaim.id), '7. the claim is now in Bob\'s own store');
    console.log('✓ Bob resolved both content kinds through one PublicationResolver — no per-kind resolver class exists');

    // ---------------------------------------------------------------
    // Carol's node has never replicated either CID — genuinely valid
    // publications, temporarily unreachable. Never reported as invalid.
    // ---------------------------------------------------------------
    const carolAttempt = await carolResolver.resolve(attributionJson, attributionKind);
    assert(carolAttempt.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
        '8. Carol\'s node reports CONTENT_UNAVAILABLE, never an invalidity outcome, for content it simply has not replicated yet');
    assert(carolAttempt.content === null, '9. content is null on a non-RESOLVED outcome');
    assert(carolAttempt.publication !== null && carolAttempt.publication.id === attributionPublication.id,
        '10. the envelope itself still parsed — Carol knows WHAT was published, just not the bytes, yet');
    assert(typeof carolAttempt.reason === 'string' && carolAttempt.reason.length > 0, '11. a human-readable reason is always present on failure');

    // The content propagates to Carol's node (the one thing a real IPFS
    // network's bitswap/DHT would eventually do on its own) — Alice's
    // own node/device is never consulted again.
    carolsNetwork.set(attributionPublication.contentReference.uri.replace('ipfs://', ''), JSON.stringify(attribution.toJSON()));
    const carolRetry = await carolResolver.resolve(attributionJson, attributionKind);
    assert(carolRetry.outcome === PublicationResolutionOutcome.RESOLVED,
        '12. once the content has propagated to Carol\'s own node, the IDENTICAL publication envelope resolves — it always pointed at the content, never at Alice\'s device');
    console.log('✓ CONTENT_UNAVAILABLE is distinct from invalid, and resolves once the content propagates — the publication never pointed at Alice\'s device');

    console.log('\nAll IPFS Publication Resolution tests passed.');
}

run().catch((error) => {
    console.error('IpfsPublicationResolution.test.js FAILED:', error);
    process.exitCode = 1;
});
