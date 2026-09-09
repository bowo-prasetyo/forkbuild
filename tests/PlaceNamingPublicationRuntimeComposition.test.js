import { readFile } from 'node:fs/promises';

import { composePlaceNamingPublicationRuntime } from '../application/PlaceNamingPublicationRuntimeComposition.js';
import { NostrPlaceNamingDiscoveryPublisher } from '../application/NostrPlaceNamingDiscoveryPublisher.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';

// 0.9.320 — Explicit Place Naming Publication Action.
// See docs/Roadmap.md, "0.9.320 — Explicit Place Naming Publication
// Action," for the full milestone story.
//
//   Section A: composePlaceNamingPublicationRuntime() builds a real
//              discoveryPublisher when publishImpl is usable
//   Section B: every call builds a fresh, independent instance — no
//              singleton
//   Section C: options are forwarded verbatim, never reinterpreted here
//   Section D: composition performs no I/O of any kind — construction only
//   Section E: a genuinely malformed (not merely absent) capability still
//              throws at composition time, unchanged
//   Section F: NEGATIVE — no publishImpl: discoveryPublisher is null, no
//              fake/stub publisher is ever constructed, no announcement is
//              ever fabricated
//   Section G: FLAGSHIP — a fake window.nostr, composed all the way through
//              to a real publish
//   Section H: architectural regression — no browser API, no orchestration
//              entry point, no coupling to Snapshot/Signed Claim
//              distribution, and (as of this same milestone) composed into
//              ui/main.js through the composition function only

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
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

function signedClaim(overrides = {}) {
    let claim = new PlaceNamingClaim({
        worldId: 'world-composition-1',
        regionId: 'region-composition-1',
        name: 'Composition Cove',
        authorIdentityId: 'did:key:zAlice',
        ...overrides
    });
    return claim.withSignature(signatureOf({ signer: claim.authorIdentityId }));
}

function fakeNostrExtension({ idPrefix = 'f' } = {}) {
    let counter = 0;
    return {
        getPublicKey: async () => 'fake-pubkey-hex',
        signEvent: async (event) => {
            counter += 1;
            const hex = counter.toString(16);
            return { ...event, id: `${idPrefix}${hex}`.padEnd(64, '0'), sig: `deadbeef${hex}`.padEnd(128, '0') };
        }
    };
}

function fakeRelaySocketCtor(network) {
    return class FakeSocket {
        constructor(url) {
            this.url = url;
            queueMicrotask(() => { if (this.onopen) this.onopen(); });
        }
        send(data) {
            const [, signedEvent] = JSON.parse(data);
            network.events.push(signedEvent);
            queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(['OK', signedEvent.id, true]) }); });
        }
        close() {}
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — builds a real collaborator when the host capability is
    // usable.
    // ---------------------------------------------------------------
    {
        const calls = [];
        const runtime = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: {
                publishImpl: async (relayUrl, eventTemplate) => { calls.push({ relayUrl, eventTemplate }); return { published: true, id: 'a'.repeat(64) }; }
            }
        });

        assert(runtime.discoveryPublisher instanceof NostrPlaceNamingDiscoveryPublisher, '1. runtime.discoveryPublisher is a real NostrPlaceNamingDiscoveryPublisher');
        assert(typeof runtime.discoveryPublisher.publish === 'function', '2. runtime.discoveryPublisher exposes a working publish()');
        assert(Object.isFrozen(runtime), '3. the returned runtime object is frozen');

        const result = await runtime.discoveryPublisher.publish(signedClaim());
        assert(result !== null && result.published === true, '4. the composed discoveryPublisher genuinely publishes');
        assert(calls.length === 1, '5. exactly one call reached the injected publishImpl');

        console.log('✓ Section A: composePlaceNamingPublicationRuntime() builds a real, working discoveryPublisher when the host capability is usable');
    }

    // ---------------------------------------------------------------
    // Section B — every call builds a fresh, independent instance.
    // ---------------------------------------------------------------
    {
        const optionsFor = () => ({ nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: async () => ({ published: true, id: 'b'.repeat(64) }) } });

        const a = composePlaceNamingPublicationRuntime(optionsFor());
        const b = composePlaceNamingPublicationRuntime(optionsFor());

        assert(a.discoveryPublisher !== b.discoveryPublisher, '6. two composition calls never share a discoveryPublisher instance');

        console.log('✓ Section B: every composition call builds a fresh, independent discoveryPublisher — no singleton behavior');
    }

    // ---------------------------------------------------------------
    // Section C — options are forwarded verbatim, never reinterpreted.
    // ---------------------------------------------------------------
    {
        const calls = [];
        const runtime = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: {
                publishImpl: async (relayUrl, eventTemplate) => { calls.push({ relayUrl, eventTemplate }); return { published: true, id: 'c'.repeat(64) }; },
                relayUrl: 'wss://custom-place-naming-relay.example',
                tagName: 'custom-tag',
                kind: 30078
            }
        });

        assert(runtime.discoveryPublisher.relayUrl === 'wss://custom-place-naming-relay.example', '7. a custom relayUrl is forwarded to the discoveryPublisher, not defaulted a second time here');

        const claim = signedClaim({ worldId: 'world-c', regionId: 'region-c' });
        await runtime.discoveryPublisher.publish(claim);
        assert(calls[0].relayUrl === 'wss://custom-place-naming-relay.example', '8. the custom relayUrl is genuinely used when publishing');
        assert(calls[0].eventTemplate.kind === 30078, '9. a custom kind is forwarded exactly as supplied');
        assert(calls[0].eventTemplate.tags[0][0] === 'custom-tag', '10. a custom tagName is forwarded exactly as supplied');
        assert(calls[0].eventTemplate.tags[0][1] === derivePlaceNamingDiscoveryTag('world-c', 'region-c'), '11. the discovery tag is still derived from the claim itself, never a caller-supplied value');

        console.log('✓ Section C: constructor options are forwarded verbatim to the discoveryPublisher, never reinterpreted here');
    }

    // ---------------------------------------------------------------
    // Section D — composition performs no I/O of any kind.
    // ---------------------------------------------------------------
    {
        let relayCalls = 0;
        const runtime = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: {
                publishImpl: async () => { relayCalls += 1; throw new Error('the relay must never be contacted during composition'); }
            }
        });

        assert(relayCalls === 0, '12. composition alone never contacts the Nostr relay');
        assert(runtime.discoveryPublisher !== null, '13. the runtime is still fully constructed despite doing no I/O');

        console.log('✓ Section D: composePlaceNamingPublicationRuntime() performs no I/O — construction only');
    }

    // ---------------------------------------------------------------
    // Section E — a genuinely malformed (not merely absent) capability
    // still throws at composition time, unchanged.
    // ---------------------------------------------------------------
    {
        expectThrows(
            () => composePlaceNamingPublicationRuntime({
                nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: async () => {}, relayUrl: '' }
            }),
            '14. a real publishImpl alongside an empty-string relayUrl still throws at composition time — absence is forgiven, malformation is not'
        );

        console.log('✓ Section E: a genuinely malformed present capability still throws at composition time — only ABSENCE degrades gracefully');
    }

    // ---------------------------------------------------------------
    // Section F — NEGATIVE: no Nostr capability.
    // ---------------------------------------------------------------
    {
        const runtime = composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions: {} });
        assert(runtime.discoveryPublisher === null, '15. no publishImpl means discoveryPublisher is null — no fake/stub publisher is ever constructed');

        const runtimeDefault = composePlaceNamingPublicationRuntime();
        assert(runtimeDefault.discoveryPublisher === null, '16. calling with no arguments at all still degrades gracefully to null, never a throw');

        console.log('✓ Section F: NEGATIVE — no Nostr capability: discoveryPublisher is null, no fake/stub publisher is ever constructed, no announcement is ever fabricated');
    }

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: a fake window.nostr, composed all the way
    // through to a real publish.
    // ---------------------------------------------------------------
    {
        const fakeWindow = { nostr: fakeNostrExtension() };
        const relayNetwork = { events: [] };
        const publishImpl = createNostrInjectedProviderPublisher({ injectedProvider: fakeWindow.nostr, webSocketImpl: fakeRelaySocketCtor(relayNetwork) });
        assert(publishImpl !== undefined, 'G0. sanity: a usable fake window.nostr produces a real publish()');

        const runtime = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl, relayUrl: 'wss://flagship-place-naming-relay.example' }
        });
        assert(runtime.discoveryPublisher instanceof NostrPlaceNamingDiscoveryPublisher, 'G1. the composition root produced a real capability from the fake host extension');

        const claim = signedClaim({ worldId: 'world-flagship', regionId: 'region-flagship', name: 'Flagship Fen' });
        const result = await runtime.discoveryPublisher.publish(claim);

        assert(result !== null && result.published === true, 'G2. FLAGSHIP — a real publish, reached only through the composed runtime, genuinely succeeded');
        assert(relayNetwork.events.length === 1, 'G3. FLAGSHIP — exactly one event reached the fake relay network');
        assert(relayNetwork.events[0].tags.some((t) => t[1] === derivePlaceNamingDiscoveryTag('world-flagship', 'region-flagship')), 'G4. FLAGSHIP — the event carries the correct discovery tag');

        console.log('✓ Section G: FLAGSHIP — a fake window.nostr -> composition root -> concrete NostrPlaceNamingDiscoveryPublisher -> a real, successful publish');
    }

    // ---------------------------------------------------------------
    // Section H — architectural regression.
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('application/PlaceNamingPublicationRuntimeComposition.js');

        const browserApiTerms = ['window.', 'navigator.', 'WebSocket', 'fetch('];
        for (const term of browserApiTerms) {
            assert(!code.includes(term), `17. application/PlaceNamingPublicationRuntimeComposition.js never references '${term}' — no browser API of any kind`);
        }

        assert(!code.includes('createNostrInjectedProviderPublisher'), '18. never imports the injected-provider factory — that stays entirely a caller\'s own concern');
        assert(!code.includes('.publish('), '19. never calls discoveryPublisher.publish() itself — composition only, never orchestration');

        const forbiddenCouplingTerms = ['ArweaveContentStore', 'NostrSnapshotDiscoveryPublisher', 'SnapshotDistributionCommand', 'PublicationDistribution'];
        for (const term of forbiddenCouplingTerms) {
            assert(!code.includes(term), `20. application/PlaceNamingPublicationRuntimeComposition.js never references '${term}' — no coupling to the Snapshot or Signed Claim distribution families`);
        }

        const forbiddenVocabTerms = ['retry', 'cache', 'dedup', 'trust', 'reputation', 'ranking', 'scoring'];
        for (const term of forbiddenVocabTerms) {
            assert(!code.toLowerCase().includes(term), `21. code must never use "${term}" — composition only, no execution/state/trust vocabulary`);
        }

        const publisherSource = await codeOnlySource('application/NostrPlaceNamingDiscoveryPublisher.js');
        assert(!publisherSource.includes('PlaceNamingPublicationRuntimeComposition'), '22. the 0.9.316 publisher itself is never modified to know about this composition file');

        // Composed into ui/main.js by this same milestone — proving the
        // gap 0.9.318/0.9.319 both recorded ("composition-root-unreachable")
        // no longer holds.
        const uiMainCode = await codeOnlySource('ui/main.js');
        assert(uiMainCode.includes('composePlaceNamingPublicationRuntime('), '23. ui/main.js now calls composePlaceNamingPublicationRuntime(), wired by 0.9.320 — Explicit Place Naming Publication Action');
        assert(uiMainCode.includes("app.provide('publishPlaceNamingClaimToNostrCommand'"), '24. ui/main.js provides the resulting command app-wide, under a dedicated key never shared with Snapshot/Publication distribution');
        assert(!uiMainCode.includes('new NostrPlaceNamingDiscoveryPublisher('), '25. ui/main.js still never constructs the concrete publisher class directly — only the composed function');

        console.log('✓ Section H: architectural regression — no browser API, no orchestration entry point, no coupling to Snapshot/Signed Claim distribution, and now composed into ui/main.js through the composition function only');
    }

    console.log('\n✅ All Place Naming Publication Runtime Composition tests passed.');
}

await run();
