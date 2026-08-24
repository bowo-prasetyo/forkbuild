import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION as ATTRIBUTION_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';

// 0.7.1 — IPFS Content Publication & Resolution.
//
// The ONE file in this codebase that ever talks to a real IPFS node.
// Every other IPFS-related test (tests/IpfsContentStore.test.js, tests/
// IpfsPublicationResolution.test.js) is deterministic and network-free
// by design, run on every `node tests/*.test.js` sweep, including this
// sandbox's own — there is no `ipfs`/Kubo binary available here, and
// this codebase adds no dependency that would let one be installed on
// demand. This file exists for a developer or CI runner that DOES have
// one or two local Kubo daemons running, and behaves as a well-mannered
// guest: it probes both API endpoints with a short timeout before doing
// anything else, and exits 0 with a clear skip message — never a
// failure — the moment either is unreachable.
//
//   FORKBUILD_TEST_IPFS_API_A (default http://127.0.0.1:5001)
//   FORKBUILD_TEST_IPFS_API_B (default http://127.0.0.1:5002)
//
// What this file actually proves, when it runs for real: the complete
// application/PublicationResolver.js pipeline — sign, add to a real
// node, build a real CID, retrieve it back over the real Kubo HTTP API,
// verify the real hash, verify the real signature — genuinely works
// against genuine IPFS wire behavior, not just this codebase's own
// idea of what that wire behavior looks like (see tests/
// IpfsContentStore.test.js's own fake node for that half of the
// coverage).
//
// Cross-node replication (content added on node A, resolved through
// node B) is reported, never asserted as pass/fail: whether that
// actually happens within this test's own short timeout depends on
// whether the two daemons are peered or reachable through the public
// DHT, a fact about the RUNNING ENVIRONMENT this test cannot control and
// must not be flaky about. A developer who wants to see it happen for
// real can `ipfs swarm connect` the two daemons together, or point both
// env vars at the SAME daemon to remove the question of replication
// entirely and exercise only the real add/cat/verify round trip.
const API_A = process.env.FORKBUILD_TEST_IPFS_API_A || 'http://127.0.0.1:5001';
const API_B = process.env.FORKBUILD_TEST_IPFS_API_B || 'http://127.0.0.1:5002';
const PROBE_TIMEOUT_MS = 1500;
const REPLICATION_TIMEOUT_MS = 5000;

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

async function isReachable(apiUrl) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
        const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/v0/version`, { method: 'POST', signal: controller.signal });
        clearTimeout(timer);
        return response.ok;
    } catch {
        return false;
    }
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
    const [reachableA, reachableB] = await Promise.all([isReachable(API_A), isReachable(API_B)]);
    if (!reachableA || !reachableB) {
        console.log(
            `⚠ Skipping IpfsLiveIntegration.test.js — no live Kubo node reachable at `
            + `${reachableA ? '' : API_A + ' '}${reachableB ? '' : API_B}`.trim()
            + `. Start one or two local nodes (\`ipfs daemon\`) and set FORKBUILD_TEST_IPFS_API_A`
            + ` / FORKBUILD_TEST_IPFS_API_B to run this file for real.`
        );
        return;
    }

    const alice = makeIdentity('Alice');
    const aliceResolver = new PublicationResolver(new IpfsContentStore({ apiUrl: API_A }), new LocalAuthorizationVerifier());

    let attribution = new BlueprintAttribution({ fingerprint: 'bp:live-integration-farmstead', authorIdentityId: alice.getSigningIdentity().id });
    attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));

    const publication = await aliceResolver.publish({
        content: attribution,
        contentKind: BLUEPRINT_ATTRIBUTION_KIND,
        contentSchemaVersion: ATTRIBUTION_SCHEMA_VERSION,
        identityProvider: alice
    });
    assert(publication.contentReference.uri.startsWith('ipfs://'), '1. a real Kubo node returned a real CID');
    console.log(`✓ Published a real BlueprintAttribution to ${API_A} — CID ${publication.contentReference.uri}`);

    const publicationJson = publication.toJSON();

    // Same-node round trip — this is the assertion this file actually
    // stakes a pass/fail on: the full pipeline works against a live node.
    const sameNodeVerifier = new LocalAuthorizationVerifier();
    const sameNodeStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());
    const sameNodeResolver = new PublicationResolver(new IpfsContentStore({ apiUrl: API_A }), sameNodeVerifier);
    const sameNodeResult = await sameNodeResolver.resolve(
        publicationJson,
        createBlueprintAttributionPublicationKind({ verifier: sameNodeVerifier, store: sameNodeStore })
    );
    assert(sameNodeResult.outcome === PublicationResolutionOutcome.RESOLVED, '2. resolves for real against the node it was published to');
    assert(sameNodeResult.content.attribution.fingerprint === 'bp:live-integration-farmstead', '3. the real round trip preserves the fingerprint');
    console.log(`✓ Resolved the real publication back through ${API_A} — the full sign/add/cat/verify pipeline works against a live node`);

    // Cross-node replication — reported, not asserted. See this file's
    // own header for why.
    if (API_A === API_B) {
        console.log('ℹ FORKBUILD_TEST_IPFS_API_A and _B are the same node — skipping the cross-node replication check entirely.');
    } else {
        const otherNodeVerifier = new LocalAuthorizationVerifier();
        const otherNodeStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());
        const otherNodeResolver = new PublicationResolver(
            new IpfsContentStore({ apiUrl: API_B, timeoutMs: REPLICATION_TIMEOUT_MS }),
            otherNodeVerifier
        );
        const kindPlugin = createBlueprintAttributionPublicationKind({ verifier: otherNodeVerifier, store: otherNodeStore });

        let crossNodeResult = await otherNodeResolver.resolve(publicationJson, kindPlugin);
        if (crossNodeResult.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE) {
            // One more attempt after a short wait — the DHT is not
            // instantaneous even when the two nodes ARE peered.
            await sleep(REPLICATION_TIMEOUT_MS);
            crossNodeResult = await otherNodeResolver.resolve(publicationJson, kindPlugin);
        }
        if (crossNodeResult.outcome === PublicationResolutionOutcome.RESOLVED) {
            console.log(`✓ ${API_B} independently resolved content published on ${API_A} — the publication points at the content, not at Alice's node.`);
        } else {
            console.log(
                `ℹ ${API_B} could not resolve content published on ${API_A} within this test's own timeout `
                + `(outcome: ${crossNodeResult.outcome}). This is expected unless the two nodes are peered `
                + `(\`ipfs swarm connect\`) or both reachable through the public DHT — not a failure of this codebase's own pipeline, `
                + `which the same-node check above already proved works.`
            );
        }
    }

    console.log('\nIpfsLiveIntegration.test.js completed against live node(s).');
}

run().catch((error) => {
    console.error('IpfsLiveIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
