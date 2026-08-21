import { RendezvousNode } from './worker.js';

// A minimal fake of the two Cloudflare-runtime surfaces RendezvousNode
// actually touches — Durable Object storage (get/put/delete/list/
// getAlarm/setAlarm) and blockConcurrencyWhile. Everything WebSocket-
// specific (acceptWebSocket, WebSocketPair, the 101 upgrade response)
// needs the real Cloudflare runtime and is deliberately NOT exercised
// here — this only proves out the PUBLISH/LOOKUP/REMOVE/expiry logic
// against peer/LocalRendezvousNetwork.js's own documented semantics
// (see worker.js's own header), the part that's actually feasible —
// and valuable — to check before ever deploying this for real.
function fakeDurableObjectState() {
    const store = new Map();
    let alarmAt = null;
    return {
        blockConcurrencyWhile: async (fn) => fn(),
        storage: {
            async get(key) { return store.has(key) ? store.get(key) : undefined; },
            async put(key, value) { store.set(key, value); },
            async delete(key) { return store.delete(key); },
            async list({ prefix = '' } = {}) {
                const result = new Map();
                for (const [key, value] of store) {
                    if (key.startsWith(prefix)) result.set(key, value);
                }
                return result;
            },
            async getAlarm() { return alarmAt; },
            async setAlarm(when) { alarmAt = when; }
        },
        _rawStore: store
    };
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makePublication({ publicationId, identityHint, expiresAt }) {
    return {
        publicationId,
        invitation: {
            formatVersion: 1,
            invitationId: 'inv-' + publicationId,
            endpoint: { offer: 'fake-sdp-offer' },
            identityHint,
            createdAt: new Date().toISOString(),
            expiresAt
        },
        publishedAt: new Date().toISOString(),
        expiresAt
    };
}

async function runTests() {
    const future = (ms) => new Date(Date.now() + ms).toISOString();
    const past = (ms) => new Date(Date.now() - ms).toISOString();

    // 1-3 — PUBLISH stores it, echoes it back, and LOOKUP finds it.
    {
        const ctx = fakeDurableObjectState();
        const node = new RendezvousNode(ctx, {});
        const alice = makePublication({ publicationId: 'pub-1', identityHint: 'alice-id', expiresAt: future(60000) });

        const published = await node._handlePublish(alice);
        assert(published === alice, '1. PUBLISH echoes the exact publication back');

        const found = await node._handleLookup('alice-id');
        assert(Array.isArray(found) && found.length === 1 && found[0].publicationId === 'pub-1',
            '2. LOOKUP by identityHint finds exactly the published entry');

        const missing = await node._handleLookup('nobody-published-this');
        assert(Array.isArray(missing) && missing.length === 0, '3. LOOKUP for an unknown identity returns an empty array, never null/throw');
    }

    // 4 — a second PUBLISH for the SAME identity REPLACES the first,
    // exactly like peer/LocalRendezvousNetwork.js's own publish().
    {
        const ctx = fakeDurableObjectState();
        const node = new RendezvousNode(ctx, {});
        await node._handlePublish(makePublication({ publicationId: 'pub-old', identityHint: 'bob-id', expiresAt: future(60000) }));
        await node._handlePublish(makePublication({ publicationId: 'pub-new', identityHint: 'bob-id', expiresAt: future(60000) }));

        const found = await node._handleLookup('bob-id');
        assert(found.length === 1 && found[0].publicationId === 'pub-new',
            '4. a fresh PUBLISH for the same identity replaces the old one, never accumulates');
    }

    // 5 — an expired entry is treated as gone by LOOKUP, and pruned
    // opportunistically on read.
    {
        const ctx = fakeDurableObjectState();
        const node = new RendezvousNode(ctx, {});
        await node._handlePublish(makePublication({ publicationId: 'pub-stale', identityHint: 'carol-id', expiresAt: past(1000) }));

        const found = await node._handleLookup('carol-id');
        assert(found.length === 0, '5. LOOKUP never returns an expired publication');
        assert(ctx._rawStore.size === 0, '5b. ...and opportunistically prunes it from storage on that same read');
    }

    // 6-7 — REMOVE by publicationId (not identityHint), and reports
    // whether anything was actually removed.
    {
        const ctx = fakeDurableObjectState();
        const node = new RendezvousNode(ctx, {});
        await node._handlePublish(makePublication({ publicationId: 'pub-remove-me', identityHint: 'dave-id', expiresAt: future(60000) }));

        const removed = await node._handleRemove('pub-remove-me');
        assert(removed === true, '6. REMOVE finds and removes a publication by its publicationId');
        assert((await node._handleLookup('dave-id')).length === 0, '6b. ...and it is genuinely gone from LOOKUP afterward');

        const removedAgain = await node._handleRemove('pub-remove-me');
        assert(removedAgain === false, '7. REMOVE on an already-gone publicationId reports false, never throws');
    }

    // 8 — a structurally invalid publication is rejected rather than
    // silently stored as something unlookupable.
    {
        const ctx = fakeDurableObjectState();
        const node = new RendezvousNode(ctx, {});
        let threw = false;
        try {
            await node._handlePublish({ publicationId: 'no-invitation-at-all' });
        } catch {
            threw = true;
        }
        assert(threw, '8. PUBLISH rejects a publication with no usable invitation/identityHint');
    }

    // 9 — the alarm sweeps every expired entry, and only expired ones.
    {
        const ctx = fakeDurableObjectState();
        const node = new RendezvousNode(ctx, {});
        await node._handlePublish(makePublication({ publicationId: 'pub-fresh', identityHint: 'erin-id', expiresAt: future(60000) }));
        // Bypass PUBLISH's own opportunistic expiry handling by writing
        // an already-expired entry straight into the fake store, the
        // same way a publication that expired AFTER being stored (but
        // before anyone happened to LOOKUP it) would look.
        ctx._rawStore.set('pub:frank-id', { publication: makePublication({ publicationId: 'pub-expired', identityHint: 'frank-id', expiresAt: past(1000) }), expiresAtMs: Date.now() - 1000 });

        await node.alarm();

        assert((await node._handleLookup('erin-id')).length === 1, '9. the alarm leaves a still-fresh publication untouched');
        assert(ctx._rawStore.has('pub:frank-id') === false, '9b. ...and sweeps an expired one out of storage');
    }

    console.log('✅ All ForkBuild Rendezvous Worker tests passed.');
}

await runTests();
