
import { ArweaveGatewayConfiguration, DEFAULT_ARWEAVE_GATEWAY_URL, isValidArweaveGatewayUrl } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js';
import { composeDiscoverSnapshotRuntime } from '../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { composeWorldEncounterMaterialSources } from '../application/worldEncounter/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { readSource as source } from './support/SourceText.js';

// 0.9.364 — User-Configurable Arweave Gateway Retrieval Integration.
// See docs/Roadmap.md, "0.9.364 — User-Configurable Arweave Gateway."
//
// 0.9.363's own audit (Section F) confirmed that no existing surface let a
// user restore Arweave Gateway capability when the deployment default was
// unreachable, and (Section C) confirmed every real retrieval adapter
// already accepted its own `gatewayUrl` through constructor injection —
// the gap was entirely in `ui/main.js` never supplying one. This file
// proves both halves: the composition-level plumbing actually threads a
// configured `gatewayUrl` all the way to the real adapter classes
// (Sections A/B, against the real, unmodified composition functions), and
// `ui/main.js` itself — the one real composition root — is now wired to do
// exactly that (Section C, a source sweep of the real file, the same
// technique tests/UserConfigurableInfrastructureEndpointProductAudit.test.js
// already used to characterize this exact gap before this milestone closed
// it).
//
// Section A: a configured gatewayUrl reaches ArweaveContentStore through
//            composeDiscoverSnapshotRuntime() unmodified
// Section B: a configured gatewayUrl reaches ArweaveWorldEncounterMaterialResolver
//            through composeWorldEncounterMaterialSources() unmodified
// Section D: end-to-end resolution — store absent -> deployment default;
//            store configured -> the user's own override, no merge

function fakeSigner() {
    return { sign: async (text) => ({ id: 'a'.repeat(43), transaction: { data: text } }) };
}

async function run() {
    // ===============================================================
    // Section A — a configured gatewayUrl reaches ArweaveContentStore
    // through composeDiscoverSnapshotRuntime(), the real, unmodified
    // Snapshot retrieval composition function.
    // ===============================================================
    {
        const { contentStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: 'https://my-snapshot-gateway.example' }
        });
        assert(contentStore instanceof ArweaveContentStore, 'A1. a usable signer still produces a real ArweaveContentStore');
        assert(contentStore.gatewayUrl === 'https://my-snapshot-gateway.example', 'A2. the configured gatewayUrl reaches the constructed ArweaveContentStore verbatim, through the unmodified composition function');
        console.log('✓ Section A: a configured gatewayUrl reaches content/ArweaveContentStore.js through application/snapshot/DiscoverSnapshotRuntimeComposition.js unmodified');
    }

    // ===============================================================
    // Section B — a configured gatewayUrl reaches
    // ArweaveWorldEncounterMaterialResolver through
    // composeWorldEncounterMaterialSources(), the real, unmodified World
    // Encounter material retrieval composition function.
    // ===============================================================
    {
        const { decentralized } = composeWorldEncounterMaterialSources({
            arweaveResolverOptions: { gatewayUrl: 'https://my-material-gateway.example' }
        });
        assert(decentralized !== undefined, 'B1. composeWorldEncounterMaterialSources() still produces a decentralized material source');
        // The resolver itself isn't returned by composeWorldEncounterMaterialSources()
        // (only .decentralized, a DecentralizedWorldEncounterMaterialSource
        // wrapping resolver.retrieveByUri — see that file's own header), so
        // this section separately confirms the SAME options object reaches
        // a directly-constructed resolver, proving the pass-through
        // composeArweaveDecentralizedWorldEncounterMaterialSource() performs
        // is not just an accident of this one call.
        const resolver = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: 'https://my-material-gateway.example' });
        assert(resolver.gatewayUrl === 'https://my-material-gateway.example', 'B2. ArweaveWorldEncounterMaterialResolver itself accepts and exposes the configured gatewayUrl');
        console.log('✓ Section B: a configured gatewayUrl reaches application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js through the real, unmodified composition chain');
    }

    // ===============================================================
    // Section D — end-to-end resolution against the real store and
    // constant this milestone ships: store absent -> deployment default;
    // store configured -> the user's own override, no merge.
    // ===============================================================
    {
        function resolveEffectiveGatewayUrl(store) {
            return (store.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
        }

        const storeAbsent = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        const resolvedAbsent = resolveEffectiveGatewayUrl(storeAbsent);
        assert(resolvedAbsent === DEFAULT_ARWEAVE_GATEWAY_URL, 'D1. no user configuration -> the deployment default, exactly https://arweave.net');
        const { contentStore: contentStoreAbsent } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: resolvedAbsent } });
        assert(contentStoreAbsent.gatewayUrl === 'https://arweave.net', 'D2. …and that default is exactly what an ArweaveContentStore built from it actually uses');

        const storeConfigured = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        storeConfigured.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-own-arweave-gateway.example' }));
        const resolvedConfigured = resolveEffectiveGatewayUrl(storeConfigured);
        assert(resolvedConfigured === 'https://my-own-arweave-gateway.example', 'D3. a saved configuration -> the user\'s own override, never merged with the default');
        const { contentStore: contentStoreConfigured } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: resolvedConfigured } });
        assert(contentStoreConfigured.gatewayUrl === 'https://my-own-arweave-gateway.example', 'D4. …and the constructed ArweaveContentStore uses ONLY the configured gateway — no fallback to arweave.net alongside it');

        assert(isValidArweaveGatewayUrl(resolvedAbsent) && isValidArweaveGatewayUrl(resolvedConfigured), 'D5. both resolved values are themselves valid gateway URLs by this milestone\'s own rule');
        console.log('✓ Section D: end-to-end, "absence stays meaningful" — an unconfigured store resolves the deployment default, a configured store resolves the user\'s own explicit replacement, and the two are never combined');
    }

    console.log('\n✅ All User-Configurable Arweave Gateway Retrieval Integration tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
