import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Bitcoin Endpoint Configuration UI Reachability Audit — REOPENED.
//
// This file used to assert, across Sections A-J, that no Bitcoin Esplora
// endpoint configuration layer or Settings UI existed, and that this was
// the correct state of affairs: "should Bitcoin Esplora be user-
// configurable" had been asked and reconfirmed DEFER seven times over
// (0.9.363/0.9.368/0.9.373/0.9.374/0.9.385/0.9.391/0.9.392), each time for
// the same reason — an optional, user-initiated action, not a primary
// journey.
//
// This audit's own Section J named, by name, the ONE thing that would
// legitimately reopen that DEFER: "a concrete, stated new requirement
// (e.g., 'the default endpoint was down and blocked a real anchor/
// verification action'), evaluated on its own merits, not 'it looks
// structurally similar to something else we already built.'" That concrete
// requirement arrived: with zero user-side override path, a down
// blockstream.info would silently and indefinitely block every one of the
// four real Bitcoin-facing actions this codebase supports (transaction
// broadcast, confirmation observation, wallet-funding lookups, and
// OP_RETURN proof verification), with no recovery available to a person
// short of waiting for a new deployment. That is exactly the class of risk
// 0.9.665's own IPFS Gateway reversal (core/IpfsGatewayConfiguration.js's
// own header) already established as sufficient grounds to reopen an
// identically-shaped, identically-reconfirmed DEFER for a sibling
// candidate — this file's own reopening rests on the same standard, not a
// weaker one.
//
// WHAT ACTUALLY CHANGED. core/BitcoinEsploraConfiguration.js, storage/
// BitcoinEsploraConfigurationStore.js, application/
// SetBitcoinEsploraConfigurationUseCase.js, and ui/views/
// BitcoinEsploraSettingsView.js now exist — the direct structural mirror of
// the Arweave Gateway / IPFS Gateway boundary, one field (this endpoint
// backs a single conceptual role, never a read/write pair — this audit's
// own former Section E already established that shape). ui/main.js
// resolves a `resolvedBitcoinEsploraApiUrl` once at startup and threads it
// into all four existing Esplora-backed use case construction sites this
// audit's own former Section D traced — the ONE thing that section found
// missing. Each of the four anchoring/BitcoinEsplora*.js /
// BitcoinOpReturnProofVerifier.js files is otherwise byte-for-byte
// unmodified: this reversal is a composition-root and settings-UI change
// only, never a rewrite of the underlying network adapters.
//
// THE REAL, FRESH VERIFICATION THIS REVERSAL RESTS ON now lives in
// tests/BitcoinEsploraConfiguration.test.js (the value object),
// tests/BitcoinEsploraConfigurationPersistence.test.js (the store), and
// tests/BitcoinEsploraSettingsEntryPoint.test.js (end-to-end reachability,
// including a Section 0 assertion that all four consumer sites actually
// receive the resolved apiUrl, and a Section F convergence proof that a
// settings-saved override actually changes a real adapter's concrete fetch
// call). This file is kept, in this trimmed form, only as the historical
// record of the reversal itself — the assertions that used to prove
// ABSENCE here have been retired outright rather than left to fail; they
// would just restate, less precisely, what the three files above already
// verify about presence.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
async function sourceExists(relativePath) {
    try { await source(relativePath); return true; } catch { return false; }
}

async function run() {
    console.log('Running Bitcoin Endpoint Configuration UI Reachability Audit (reopened)...\n');

    // ===============================================================
    // Section K — the configuration layer this audit's own former
    // Section C found absent now exists, at every layer that layer
    // predicted (core value object, storage, application write use case).
    // ===============================================================
    {
        assert(await sourceExists('core/BitcoinEsploraConfiguration.js'), n('K1. core/BitcoinEsploraConfiguration.js now exists'));
        assert(await sourceExists('storage/BitcoinEsploraConfigurationStore.js'), n('K2. storage/BitcoinEsploraConfigurationStore.js now exists'));
        assert(await sourceExists('application/settings/SetBitcoinEsploraConfigurationUseCase.js'), n('K3. application/settings/SetBitcoinEsploraConfigurationUseCase.js now exists'));
        console.log('✓ Section K: the configuration/persistence/write-use-case layer this audit\'s own former Section C found completely absent now exists.');
    }

    // ===============================================================
    // Section L — the four Bitcoin Esplora consumer use case construction
    // sites this audit's own former Section D traced (and found receiving
    // no apiUrl anywhere) now all receive the resolved, settings-backed
    // apiUrl.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');
        const consumers = [
            'CreateBitcoinAnchorProofVerifierUseCase',
            'CreateBitcoinEsploraTransactionConfirmationObserverUseCase',
            'CreateBitcoinEsploraWalletFundingSourceUseCase',
            'CreateBitcoinEsploraTransactionBroadcasterUseCase'
        ];
        for (const useCase of consumers) {
            const pattern = new RegExp(`new ${useCase}\\(\\)\\.execute\\(\\{\\s*apiUrl:\\s*resolvedBitcoinEsploraApiUrl\\s*\\}\\)`);
            assert(pattern.test(mainSource), n(`L1[${useCase}]. its own .execute() call now passes { apiUrl: resolvedBitcoinEsploraApiUrl }, resolved from the new settings store — previously none of the four passed any apiUrl at all`));
        }
        console.log('✓ Section L: all four Bitcoin Esplora-backed use case construction sites this audit\'s own former Section D found hardcoded now consume a user-configurable, settings-backed endpoint.');
    }

    // ===============================================================
    // Section M — the Settings UI this audit's own former Section F found
    // absent at every layer (hub row, route, view component) now exists.
    // ===============================================================
    {
        const networkSettingsSource = await source('ui/views/NetworkSettingsView.js');
        assert(/bitcoin-esplora/i.test(networkSettingsSource), n('M1. ui/views/NetworkSettingsView.js now carries a Bitcoin Endpoint row'));

        const routerSource = await source('ui/router/index.js');
        assert(/\/settings\/bitcoin-esplora/.test(routerSource), n('M2. ui/router/index.js now registers /settings/bitcoin-esplora'));
        assert(await sourceExists('ui/views/BitcoinEsploraSettingsView.js'), n('M3. ui/views/BitcoinEsploraSettingsView.js now exists and is reachable — see tests/BitcoinEsploraSettingsEntryPoint.test.js\'s own Section 0 for the full reachability chain (nav link, route, composition-root wiring, view wiring)'));
        console.log('✓ Section M: the Settings UI this audit\'s own former Section F found absent at every layer now exists and is reachable end to end.');
    }

    console.log(`\nAll ${assertionCount} assertions passed.`);
    console.log('\n=== VERDICT: DEFER REOPENED AND CLOSED — see tests/BitcoinEsploraSettingsEntryPoint.test.js for full coverage ===');
}

run().then(() => {
    console.log('\n✅ All BitcoinEndpointConfigurationUIReachabilityAudit tests passed.');
}).catch((error) => {
    console.error('BitcoinEndpointConfigurationUIReachabilityAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
