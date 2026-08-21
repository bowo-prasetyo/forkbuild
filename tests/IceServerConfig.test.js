import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';

// 0.3.7 — fetchIceServers(): the dynamic counterpart to
// DEFAULT_ICE_SERVERS, fetching this deployment's Metered TURN
// credentials from Metered's own REST API at runtime. Central claim
// under test: this NEVER throws and NEVER hangs past its own bounded
// timeout, regardless of how the network behaves — a slow/failing/
// malformed response degrades to `fallback`, exactly like every other
// "network is harder to find, never impossible to use what was
// already known" degradation this codebase already applies elsewhere
// (peer/RendezvousDiscoveryProvider.js's own lookup-failure handling,
// peer/WebRtcPeerConnection.js's own 0.3.6 ICE-gathering timeout).

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body, { ok = true } = {}) {
    return { ok, json: async () => body };
}

async function runTests() {
    // 1-2 — a successful fetch merges the fetched entries with the
    // fallback (never REPLACES it — Google's public STUN stays as a
    // baseline that doesn't depend on the fetch ever succeeding).
    {
        const fetched = [
            { urls: 'stun:stun.relay.metered.ca:80' },
            { urls: 'turn:standard.relay.metered.ca:80', username: 'u', credential: 'c' }
        ];
        const fetchImpl = async () => jsonResponse(fetched);
        const result = await fetchIceServers({ apiKey: 'test-key', fetchImpl, fallback: DEFAULT_ICE_SERVERS });

        assert(result.length === fetched.length + DEFAULT_ICE_SERVERS.length,
            '1. a successful fetch merges fetched entries WITH the fallback, never replacing it');
        assert(result[0].urls === 'stun:stun.relay.metered.ca:80', '2. ...fetched entries come first');
    }

    // 3 — duplicate `urls` (fetched entry happens to match a fallback
    // entry exactly) are deduped, not gathered twice.
    {
        const fetched = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:example.test:80', username: 'u', credential: 'c' }];
        const fetchImpl = async () => jsonResponse(fetched);
        const result = await fetchIceServers({ apiKey: 'test-key', fetchImpl, fallback: DEFAULT_ICE_SERVERS });

        const googleStunCount = result.filter((s) => s.urls === 'stun:stun.l.google.com:19302').length;
        assert(googleStunCount === 1, '3. an exact urls duplicate between fetched and fallback is deduped, not gathered twice');
    }

    // 4 — a non-ok HTTP response (e.g. a bad/revoked apiKey) degrades
    // to the fallback, never throws.
    {
        const fetchImpl = async () => jsonResponse([], { ok: false });
        const result = await fetchIceServers({ apiKey: 'bad-key', fetchImpl, fallback: DEFAULT_ICE_SERVERS });
        assert(result === DEFAULT_ICE_SERVERS, '4. a non-ok response degrades straight to the fallback');
    }

    // 5 — malformed responses (not an array, or an empty array) degrade
    // to the fallback rather than being used as-is.
    {
        const notAnArray = async () => jsonResponse({ unexpected: 'shape' });
        assert((await fetchIceServers({ apiKey: 'k', fetchImpl: notAnArray, fallback: DEFAULT_ICE_SERVERS })) === DEFAULT_ICE_SERVERS,
            '5. a non-array response body degrades to the fallback');

        const emptyArray = async () => jsonResponse([]);
        assert((await fetchIceServers({ apiKey: 'k', fetchImpl: emptyArray, fallback: DEFAULT_ICE_SERVERS })) === DEFAULT_ICE_SERVERS,
            '6. an empty array response degrades to the fallback (nothing useful to merge in)');
    }

    // 7 — a network-level failure (fetch itself rejects) degrades to
    // the fallback, never propagates as an unhandled rejection.
    {
        const fetchImpl = async () => { throw new Error('network unreachable'); };
        const result = await fetchIceServers({ apiKey: 'k', fetchImpl, fallback: DEFAULT_ICE_SERVERS });
        assert(result === DEFAULT_ICE_SERVERS, '7. a rejected fetch degrades to the fallback rather than throwing');
    }

    // 8 — a fetch that never settles at all is bounded by timeoutMs,
    // and the request is actually ABORTED (not just abandoned) —
    // mirroring how a real fetch() + AbortController pair behaves.
    {
        let sawAbort = false;
        const fetchImpl = (url, options) => new Promise((resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
                sawAbort = true;
                reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
            // Deliberately never resolves/rejects on its own — only the
            // abort signal (or the test finishing) ever settles this.
        });

        const start = Date.now();
        const result = await fetchIceServers({ apiKey: 'k', fetchImpl, fallback: DEFAULT_ICE_SERVERS, timeoutMs: 30 });
        const elapsed = Date.now() - start;

        assert(result === DEFAULT_ICE_SERVERS, '8. a fetch that never settles degrades to the fallback once timeoutMs elapses');
        assert(elapsed < 500, `9. ...and does so promptly, bounded by timeoutMs, never hanging indefinitely (took ${elapsed}ms)`);
        assert(sawAbort === true, '10. ...by actually aborting the in-flight request, not merely giving up on waiting for it');
    }

    // 11 — no apiKey configured at all: returns the fallback
    // immediately, without ever calling fetchImpl (nothing to
    // authenticate the request with).
    {
        let called = false;
        const fetchImpl = async () => { called = true; return jsonResponse([]); };
        const result = await fetchIceServers({ apiKey: '', fetchImpl, fallback: DEFAULT_ICE_SERVERS });
        assert(result === DEFAULT_ICE_SERVERS, '11. no apiKey configured degrades straight to the fallback');
        assert(called === false, '12. ...without ever attempting the network call at all');
    }

    // 13 — the request URL/query string actually carries the apiKey,
    // and the endpoint is overridable.
    {
        let capturedUrl = null;
        const fetchImpl = async (url) => { capturedUrl = url; return jsonResponse([{ urls: 'stun:example.test:80' }]); };
        await fetchIceServers({ apiKey: 'my-key-123', endpoint: 'https://example.test/turn', fetchImpl, fallback: [] });
        assert(capturedUrl === 'https://example.test/turn?apiKey=my-key-123',
            '13. the configured endpoint and apiKey are both actually used to build the request URL');
    }

    // 14-16 — WebRtcPeerConnectionProvider#setIceServers(): updates
    // apply to FUTURE connections only, never retroactively to ones
    // already created — an RTCPeerConnection's own ICE configuration is
    // fixed at construction, same as any real WebRTC implementation.
    {
        const provider = new WebRtcPeerConnectionProvider({ iceServers: [{ urls: 'stun:before.test:80' }] });
        assert(provider._iceServers[0].urls === 'stun:before.test:80', '14. starts with whatever iceServers the constructor was given');

        provider.setIceServers([{ urls: 'stun:after.test:80' }]);
        assert(provider._iceServers[0].urls === 'stun:after.test:80', '15. setIceServers() replaces the provider-level list in place');

        provider.setIceServers('not-an-array');
        assert(Array.isArray(provider._iceServers) && provider._iceServers.length === 0,
            '16. a non-array argument degrades to an empty list rather than storing garbage');

        provider.dispose();
    }

    console.log('✅ All ICE Server Config tests passed.');
}

await runTests();
