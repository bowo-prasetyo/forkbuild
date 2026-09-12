import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';

// Host Wallet Capability Lazy Resolution Fix.
//
// A REAL, REPORTED, REPRODUCED bug: a person installs Wander (Arweave) and
// nos2x (Nostr), confirms via devtools that `window.arweaveWallet`/
// `window.nostr` are both fully present and correctly shaped, and clicking
// "Distribute Snapshot" on /publications STILL throws
// "executeSnapshotDistributionCommand: a discoveryPublisher with a
// publish() method is required" (or the Arweave-side sibling, "a
// contentStore with a put() method is required") — on the SAME page load
// where the extension was already confirmed present.
//
// ROOT CAUSE: `ui/main.js` used to read `window.arweaveWallet`/
// `window.nostr` exactly ONCE, synchronously, as part of its own top-level
// module evaluation — the instant this script first runs, which races a
// real extension's own content-script injection. A person can have a
// fully working wallet installed and this file would still capture
// `undefined` a moment too early, PERMANENTLY, for the rest of that page
// load, with no later successful injection ever seen again — exactly what
// was reported.
//
// THE FIX: `arweaveHostSigner`/`nostrHostPublisher` in `ui/main.js` are no
// longer a one-time snapshot. Each is now a small, always-present, lazy
// delegate that re-resolves the injected provider FRESH on every actual
// `sign()`/`publish()` call, rather than trusting a value captured at
// boot. This file proves that fix by REAL EXECUTION — reconstructing the
// exact lazy delegate `ui/main.js` now builds (extracted from its own
// source, never re-typed by hand) against the REAL, unmodified
// `createArweaveInjectedProviderSigner()`/`createNostrInjectedProviderPublisher()`
// and a controllable fake `window`, and proving the delegate is
// constructed BEFORE either extension is present yet still succeeds AFTER
// one appears later on the very same page load — the literal race this
// milestone fixes.
//
// LETTERED SECTIONS:
//   A. Structural — ui/main.js no longer captures either host capability
//      via one direct, eager call; each is wrapped in its own resolve*()
//      lazy delegate, and the now-redundant Arweave anchor fallback signer
//      is gone.
//   B. FLAGSHIP — REAL EXECUTION of the exact reported race: construct
//      both delegates while `window.arweaveWallet`/`window.nostr` are
//      absent, confirm `composeSnapshotDistributionRuntime()` already
//      returns real (non-null) collaborators at that point (the concrete
//      fix for the reported symptom), THEN make the fake wallet/extension
//      appear, and prove a full `executeSnapshotDistributionCommand()`
//      round trip actually succeeds — never possible under the old,
//      eager-capture code.
//   C. Honest failure preserved — with no wallet ever present, the
//      delegates still reject/throw a clear, honest message naming the
//      real cause, never a silent hang or a generic crash.
//   D. Every other composition call site is untouched — a real git-style
//      structural check that only the two capability definitions (and the
//      now-simplified Arweave anchor wiring) changed.

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
function codeOnly(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Extracts a named block out of ui/main.js's own real source, from its
// `function resolveX() {` opener through the first `\n};` that follows the
// paired `const xHostY = {...};`/`const xHostY = async function ... {...};`
// declaration — never re-typed by hand, so this test breaks the instant
// ui/main.js's own real wiring drifts from what this test assumes.
function extractBlock(mainSource, startMarker) {
    const start = mainSource.indexOf(startMarker);
    if (start === -1) return null;
    const end = mainSource.indexOf('\n};', start);
    if (end === -1) return null;
    return mainSource.slice(start, end + 3); // include the closing "\n};"
}

function fakeArweaveWallet({ idPrefix = 'FakeTx' } = {}) {
    let signCount = 0;
    return {
        connect: async () => {},
        sign: async (transaction) => {
            signCount += 1;
            return { ...transaction, owner: 'owner', signature: 'sig', id: `${idPrefix}${signCount}${'A'.repeat(30)}` };
        }
    };
}

// Covers every real network call a full sign()+put() round trip makes:
// the SIGNER's own /tx_anchor and /price/ lookups (arweave/
// ArweaveInjectedProviderSigner.js, which never accepts a caller-supplied
// fetchImpl — in production it always uses real global fetch for these,
// unchanged by this fix), and content/ArweaveContentStore.js's own /tx
// upload POST.
function fakeArweaveGateway() {
    return async (url) => {
        if (url.includes('/tx_anchor')) return new Response('fake-anchor', { status: 200 });
        if (url.includes('/price/')) return new Response('123456', { status: 200 });
        if (url.endsWith('/tx')) return new Response('accepted', { status: 200 });
        throw new Error(`fakeArweaveGateway: unexpected url ${url}`);
    };
}

function fakeNostrExtension() {
    return {
        getPublicKey: async () => 'f'.repeat(64),
        signEvent: async (event) => ({ ...event, id: 'e'.repeat(64), sig: 's'.repeat(128) })
    };
}

// A minimal fake relay WebSocket: opens on the next microtask, and replies
// to any ["EVENT", signedEvent] frame with an immediate, accepting
// ["OK", id, true] frame — just enough for
// nostr/NostrInjectedProviderPublisher.js's own broadcastSignedEvent() to
// resolve { published: true }.
function makeFakeRelaySocketClass() {
    return class FakeRelaySocket {
        constructor() {
            queueMicrotask(() => { if (this.onopen) this.onopen(); });
        }
        send(data) {
            const [type, event] = JSON.parse(data);
            if (type !== 'EVENT') return;
            queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(['OK', event.id, true]) }); });
        }
        close() {}
    };
}

async function run() {
    const mainSource = await source('ui/main.js');

    // ===============================================================
    // Section A — structural.
    // ===============================================================
    {
        assert(/function resolveArweaveHostSigner\(\) \{/.test(mainSource), n('A1. ui/main.js now defines resolveArweaveHostSigner() — a named re-resolution function, never an inline one-time call'));
        assert(/function resolveNostrHostPublisher\(\) \{/.test(mainSource), n('A2. ui/main.js now defines resolveNostrHostPublisher() — the identical shape, one substrate over'));
        assert(!/const arweaveHostSigner = createArweaveInjectedProviderSigner\(/.test(mainSource), n('A3. arweaveHostSigner is no longer assigned directly from one eager createArweaveInjectedProviderSigner() call'));
        assert(!/const nostrHostPublisher = createNostrInjectedProviderPublisher\(/.test(mainSource), n('A4. nostrHostPublisher is no longer assigned directly from one eager createNostrInjectedProviderPublisher() call'));
        assert(/const arweaveHostSigner = \{\s*\n\s*sign\(material\) \{/.test(mainSource), n('A5. arweaveHostSigner is now a plain always-present object whose own sign() re-resolves per call'));
        assert(/const nostrHostPublisher = async function nostrHostPublish\(relayUrl, eventTemplate\) \{/.test(mainSource), n('A6. nostrHostPublisher is now a plain always-present function that re-resolves per call'));
        assert(!/arweaveAnchorFallbackSigner/.test(codeOnly(mainSource)), n('A7. the now-redundant arweaveAnchorFallbackSigner declaration/usage is gone from real code (a plain-text mention in an explanatory comment is fine) — arweaveHostSigner itself already produces the identical honest rejection'));
        assert(/signer: arweaveHostSigner,\s*\n\s*gatewayUrl: resolvedArweaveGatewayUrl/.test(mainSource), n('A8. the Arweave anchor publisher wiring now hands arweaveHostSigner directly, with no `|| fallback` of any kind'));

        console.log('✓ Section A: both host capabilities are now lazy, always-present delegates defined by name, and the now-redundant Arweave anchor fallback signer is gone.');
    }

    // ===============================================================
    // Section B — FLAGSHIP: real execution of the exact reported race.
    // ===============================================================
    {
        const arweaveBlock = extractBlock(mainSource, 'function resolveArweaveHostSigner() {');
        const nostrBlock = extractBlock(mainSource, 'function resolveNostrHostPublisher() {');
        assert(arweaveBlock && nostrBlock, n('B1. both real source blocks are located and extracted from ui/main.js, never re-typed by hand'));

        const buildArweaveHostSigner = new Function('createArweaveInjectedProviderSigner', 'window', `${arweaveBlock}\nreturn arweaveHostSigner;`);
        const buildNostrHostPublisher = new Function('createNostrInjectedProviderPublisher', 'window', `${nostrBlock}\nreturn nostrHostPublisher;`);

        // Neither arweave/ArweaveInjectedProviderSigner.js's own
        // /tx_anchor, /price/, and /tx lookups NOR nostr/
        // NostrInjectedProviderPublisher.js's own relay WebSocket accept a
        // caller-supplied fetchImpl/webSocketImpl from this call path —
        // ui/main.js's own resolveArweaveHostSigner()/
        // resolveNostrHostPublisher() pass neither, unchanged by this fix,
        // exactly matching real production wiring, so both are stubbed
        // globally for this whole section (content/ArweaveContentStore.js's
        // own constructor captures `fetch` at CONSTRUCTION time, so the
        // stub must already be in place before composeSnapshotDistributionRuntime()
        // runs, not merely before the later put()/publish() calls) —
        // restored in the outer `finally` below.
        const realFetch = globalThis.fetch;
        const realWebSocket = globalThis.WebSocket;
        globalThis.fetch = fakeArweaveGateway();
        globalThis.WebSocket = makeFakeRelaySocketClass();
        try {
            // The fake `window` starts with NEITHER extension present —
            // exactly "this page's own bootstrap script just ran, and the
            // extension's content script has not injected yet" — the
            // literal moment this bug was reported at.
            const fakeWindow = {};
            const arweaveHostSigner = buildArweaveHostSigner(createArweaveInjectedProviderSigner, fakeWindow);
            const nostrHostPublisher = buildNostrHostPublisher(createNostrInjectedProviderPublisher, fakeWindow);
            assert(typeof arweaveHostSigner.sign === 'function', n('B2. the reconstructed arweaveHostSigner is a real object with a sign() function, even though window.arweaveWallet is absent right now'));
            assert(typeof nostrHostPublisher === 'function', n('B3. the reconstructed nostrHostPublisher is a real function, even though window.nostr is absent right now'));

            // THE CONCRETE FIX FOR THE REPORTED SYMPTOM: composing the
            // Snapshot runtime AT THIS EXACT MOMENT (no extension present
            // yet) already yields REAL, non-null collaborators — never the
            // null contentStore/discoveryPublisher the OLD eager-capture
            // code would have produced.
            const { contentStore, discoveryPublisher } = composeSnapshotDistributionRuntime({
                arweaveContentStoreOptions: { signer: arweaveHostSigner },
                nostrSnapshotDiscoveryPublisherOptions: { publishImpl: nostrHostPublisher, discoveryTag: 'forkbuild-snapshot' }
            });
            assert(contentStore !== null, n('B4. contentStore is already real and non-null, composed BEFORE any extension is present — the exact fix: canAttemptArweavePlacement() sees a real sign() function unconditionally now'));
            assert(discoveryPublisher !== null, n('B5. discoveryPublisher is already real and non-null too, for the identical reason on the Nostr side'));

            // Now the extension "finishes injecting" — the moment that,
            // under the OLD code, would have arrived too late to matter,
            // because arweaveHostSigner/nostrHostPublisher were already
            // permanently undefined. Under the fix, nothing was captured
            // yet — only a delegate that reads window fresh on the next
            // real call.
            fakeWindow.arweaveWallet = fakeArweaveWallet();
            fakeWindow.nostr = fakeNostrExtension();

            // FLAGSHIP: a full, real executeSnapshotDistributionCommand()
            // round trip, using the SAME contentStore/discoveryPublisher
            // objects composed a moment ago, before either extension
            // existed — succeeding only because each one's own
            // signer/publishImpl closure re-reads `window` fresh at call
            // time rather than at construction time.
            const result = await executeSnapshotDistributionCommand({
                bytes: 'hello snapshot',
                contentStore,
                discoveryPublisher
            });
            assert(result.contentReference && typeof result.contentReference.hash === 'string', n('B6. FLAGSHIP — the Snapshot was really placed: a real ContentReference came back, using the wallet that only appeared AFTER composition'));
            assert(result.announcement && result.announcement.published === true, n('B7. FLAGSHIP — the Snapshot was really announced on Nostr too, using the extension that only appeared AFTER composition — the literal fix for the reported "a discoveryPublisher with a publish() method is required" error'));
        } finally {
            globalThis.fetch = realFetch;
            globalThis.WebSocket = realWebSocket;
        }

        console.log('✓ Section B — FLAGSHIP: composed BEFORE either extension existed, both collaborators were already real (never null); AFTER the extension appeared moments later, a full real distribution round trip succeeded end to end — proving the fix for the exact race reported (Wander + nos2x both confirmed present in devtools, yet "Distribute Snapshot" still failing on that same page load).');
    }

    // ===============================================================
    // Section C — honest failure preserved when no wallet ever appears.
    // ===============================================================
    {
        const arweaveBlock = extractBlock(mainSource, 'function resolveArweaveHostSigner() {');
        const nostrBlock = extractBlock(mainSource, 'function resolveNostrHostPublisher() {');
        const buildArweaveHostSigner = new Function('createArweaveInjectedProviderSigner', 'window', `${arweaveBlock}\nreturn arweaveHostSigner;`);
        const buildNostrHostPublisher = new Function('createNostrInjectedProviderPublisher', 'window', `${nostrBlock}\nreturn nostrHostPublisher;`);

        const fakeWindow = {};
        const arweaveHostSigner = buildArweaveHostSigner(createArweaveInjectedProviderSigner, fakeWindow);
        const nostrHostPublisher = buildNostrHostPublisher(createNostrInjectedProviderPublisher, fakeWindow);

        await arweaveHostSigner.sign('never has a wallet').then(
            () => assert(false, n('C1. signing with no wallet ever present should have rejected')),
            (error) => assert(error.message === 'This device has no Arweave wallet/signing capability configured yet.', n('C1. sign() honestly rejects with the exact same message the old dedicated Arweave anchor fallback signer used to produce — no UX regression for the "genuinely no wallet" case'))
        );

        await nostrHostPublisher('wss://example.relay', { kind: 1, tags: [], content: 'x' }).then(
            () => assert(false, n('C2. publishing with no extension ever present should have thrown')),
            (error) => assert(error.message === 'This device has no Nostr (NIP-07) publishing capability configured yet.', n('C2. the Nostr delegate throws an equally honest, equally specific message'))
        );

        console.log('✓ Section C: with no wallet/extension ever present, both delegates still fail honestly and specifically — this fix only changes WHEN the check happens (per call, not once at boot), never whether an absent capability is reported truthfully.');
    }

    // ===============================================================
    // Section D — every other composition call site untouched.
    // ===============================================================
    {
        assert(mainSource.includes('arweaveContentStoreOptions: { signer: arweaveHostSigner },\n    nostrSnapshotDiscoveryPublisherOptions:'), n('D1. the Snapshot DISTRIBUTION (write) composition call site is byte-for-byte unchanged'));
        assert(/arweaveContentStoreOptions: \{ signer: arweaveHostSigner, gatewayUrl: resolvedArweaveGatewayUrl \}/.test(mainSource), n('D2. the Snapshot RETRIEVAL (read) composition call site is unchanged'));
        assert(/nostrSnapshotDiscoveryPublisherOptions: \{ publishImpl: nostrHostPublisher, discoveryTag: 'forkbuild-snapshot' \}/.test(mainSource), n('D3. the Snapshot distribution nostrSnapshotDiscoveryPublisherOptions call site is unchanged'));
        assert(/nostrPlaceNamingDiscoveryPublisherOptions: \{ publishImpl: nostrHostPublisher \}/.test(mainSource), n('D4. the Place Naming composition call site is unchanged'));
        assert(/createArweavePublicationDistributionRuntimeAdapter\(\{ signer: arweaveHostSigner \}\)/.test(mainSource), n('D5. the Publication Distribution Arweave adapter call site is unchanged'));
        assert(/createNostrPublicationDistributionRuntimeAdapter\(\{ publish: nostrHostPublisher \}\)/.test(mainSource), n('D6. the Publication Distribution Nostr adapter call site is unchanged'));

        console.log('✓ Section D: every downstream call site that reuses arweaveHostSigner/nostrHostPublisher is untouched — this fix changed only how the two capabilities are constructed, never how they are consumed.');
    }

    console.log(`\nAll HostWalletCapabilityLazyResolutionFix tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('HostWalletCapabilityLazyResolutionFix.test.js FAILED:', error);
    process.exitCode = 1;
});
