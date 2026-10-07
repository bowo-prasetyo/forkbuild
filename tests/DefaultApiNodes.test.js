// Steem and Blurt read from three default API nodes, each run by a
// different operator, but their anchor verifiers, which need every node
// that answers to agree, ask only the first two of them. Any other list,
// such as one someone saved, is asked as it is.
import { DEFAULT_STEEM_API_NODES, DEFAULT_STEEM_PROOF_NODES, SteemReadingConfiguration } from '../core/SteemReadingConfiguration.js';
import { DEFAULT_BLURT_API_NODES, DEFAULT_BLURT_PROOF_NODES, BlurtReadingConfiguration } from '../core/BlurtReadingConfiguration.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { composeBlurtRuntime } from '../application/blurt/BlurtRuntimeComposition.js';
import { SteemProofVerifier } from '../anchoring/SteemProofVerifier.js';
import { BlurtProofVerifier } from '../anchoring/BlurtProofVerifier.js';
import { assert } from './support/Assert.js';

const offline = async () => { throw new Error('offline'); };

for (const { name, defaults, proofDefaults, Configuration, compose, Verifier } of [
    { name: 'Steem', defaults: DEFAULT_STEEM_API_NODES, proofDefaults: DEFAULT_STEEM_PROOF_NODES, Configuration: SteemReadingConfiguration, compose: composeSteemRuntime, Verifier: SteemProofVerifier },
    { name: 'Blurt', defaults: DEFAULT_BLURT_API_NODES, proofDefaults: DEFAULT_BLURT_PROOF_NODES, Configuration: BlurtReadingConfiguration, compose: composeBlurtRuntime, Verifier: BlurtProofVerifier }
]) {
    assert(defaults.length === 3, `${name} reads from three default nodes`);
    assert(new Set(defaults.map((node) => new URL(node).hostname.split('.').slice(-2).join('.'))).size === 3, `${name}'s default nodes are three operators`);
    assert(proofDefaults.join() === defaults.slice(0, 2).join(), `${name}'s verifier defaults to the first two`);

    const reads = [];
    const fetchImpl = async (url) => { reads.push(url); throw new Error('offline'); };
    const runtime = compose({ fetchImpl });
    assert(runtime.proofVerifier.nodes.join() === proofDefaults.join(), `with the defaults, ${name}'s verifier asks two nodes`);
    await runtime.snapshotDiscoveryQueryService.searchWithOutcome('forkbuild-snapshot');
    assert(defaults.every((node) => reads.includes(node)), `reading falls over through all three default nodes (asked ${[...new Set(reads)]})`);

    const saved = ['https://one.example', 'https://two.example', 'https://three.example'];
    const custom = compose({ configuration: new Configuration({ apiNodes: saved }), fetchImpl: offline });
    assert(custom.proofVerifier.nodes.join() === saved.join(), `a saved ${name} list is verified against as saved`);
    const reordered = compose({ configuration: new Configuration({ apiNodes: [...defaults].reverse() }), fetchImpl: offline });
    assert(reordered.proofVerifier.nodes.length === 3, `a saved ${name} list that only reorders the defaults is the person's own`);
    assert(new Verifier({ fetchImpl: offline }).nodes.join() === proofDefaults.join(), `${name}'s verifier on its own defaults to two nodes`);
    console.log(`✓ ${name}'s default nodes`);
}
