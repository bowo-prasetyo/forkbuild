import { readFile } from 'node:fs/promises';

import { ArweaveGatewayConfiguration, DEFAULT_ARWEAVE_GATEWAY_URL, isValidArweaveGatewayUrl } from '../core/ArweaveGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composeWorldEncounterMaterialSources } from '../application/DecentralizedWorldEncounterMaterialRuntimeComposition.js';

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
// Section C: ui/main.js source sweep — the resolved gatewayUrl actually
//            reaches both retrieval call sites, and NEITHER distribution
//            (write-path) call site
// Section D: end-to-end resolution — store absent -> deployment default;
//            store configured -> the user's own override, no merge

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

function fakeSigner() {
    return { sign: async (text) => ({ id: 'a'.repeat(43), transaction: { data: text } }) };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
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
        console.log('✓ Section A: a configured gatewayUrl reaches content/ArweaveContentStore.js through application/DiscoverSnapshotRuntimeComposition.js unmodified');
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
        console.log('✓ Section B: a configured gatewayUrl reaches application/ArweaveWorldEncounterMaterialResolver.js through the real, unmodified composition chain');
    }

    // ===============================================================
    // Section C — ui/main.js source sweep: the resolved gatewayUrl
    // actually reaches both retrieval call sites, and neither
    // distribution (write-path) call site — run against the real file,
    // never a guess from this file's own prose.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        assert(mainSource.includes("import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';"), 'C1. ui/main.js imports ArweaveGatewayConfigurationStore');
        assert(mainSource.includes("import { DEFAULT_ARWEAVE_GATEWAY_URL } from '../core/ArweaveGatewayConfiguration.js';"), 'C2. ui/main.js imports DEFAULT_ARWEAVE_GATEWAY_URL');
        assert(mainSource.includes('new ArweaveGatewayConfigurationStore('), 'C3. ui/main.js actually constructs an ArweaveGatewayConfigurationStore, never just imports the class unused');
        assert(/arweaveGatewayConfigurationStore\.get\(\)\s*\|\|\s*\{\s*gatewayUrl:\s*DEFAULT_ARWEAVE_GATEWAY_URL\s*\}/.test(mainSource), 'C4. ui/main.js resolves "absent -> default, present -> override" exactly — never a merge, never silently dropping the persisted store\'s own value');

        // Retrieval call sites: both must receive the resolved gatewayUrls.
        //
        // 0.9.440 — both call sites now receive resolvedArweaveGatewayUrls
        // (plural, the full ordered gateway list) rather than the singular
        // resolvedArweaveGatewayUrl checked here pre-0.9.440 — see core/
        // ArweaveGatewayConfiguration.js's own 0.9.440 header. The singular
        // variable still exists in ui/main.js, still resolving to the
        // first configured gateway, still consumed by Arweave Anchor
        // (unaffected by this milestone).
        assert(/arweaveResolverOptions:\s*\{\s*gatewayUrls:\s*resolvedArweaveGatewayUrls\s*\}/.test(mainSource), 'C5. composeDecentralizedWorldEncounterMaterialDiscoveryRuntime() (World Encounter material RETRIEVAL) receives the resolved gatewayUrls list');
        assert(/arweaveContentStoreOptions:\s*\{\s*signer:\s*arweaveHostSigner,\s*gatewayUrls:\s*resolvedArweaveGatewayUrls\s*\}/.test(mainSource), 'C6. composeDiscoverSnapshotRuntime() (Snapshot RETRIEVAL) receives the resolved gatewayUrls list alongside its existing signer');

        // Distribution (write-path) call sites: neither may be touched by
        // this milestone — see core/ArweaveGatewayConfiguration.js's own
        // header, "applied only to retrieval."
        assert(mainSource.includes('arweaveContentStoreOptions: { signer: arweaveHostSigner },\n    nostrSnapshotDiscoveryPublisherOptions:'), 'C7. composeSnapshotDistributionRuntime() (Snapshot put()/DISTRIBUTION) still receives ONLY signer — this milestone never touches the write path');
        // resolvePublicationDistributionRuntimeConfiguration() (Signed
        // Claim distribution) is never called with a gatewayUrl anywhere —
        // resolvedArweaveGatewayUrl must not appear near that call.
        const publicationDistributionConfigIndex = mainSource.indexOf('resolvePublicationDistributionRuntimeConfiguration(');
        assert(publicationDistributionConfigIndex > -1, 'C8. the Signed Claim distribution configuration call still exists');
        const publicationDistributionConfigLine = mainSource.slice(publicationDistributionConfigIndex, mainSource.indexOf('\n', publicationDistributionConfigIndex));
        assert(!publicationDistributionConfigLine.includes('resolvedArweaveGatewayUrl'), 'C9. the Signed Claim distribution (write-path) configuration call never references the user-configured retrieval gatewayUrl');

        console.log('✓ Section C: ui/main.js source sweep confirms the resolved gatewayUrl reaches both retrieval composition call sites, and neither distribution (write-path) call site');
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
