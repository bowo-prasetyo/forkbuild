import { featureImportLines } from './support/SharedHelperImports.js';

import { createArweaveTaggedTransactionUpload } from '../application/arweave/ArweaveTaggedTransactionUpload.js';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/arweave/ArweaveGraphqlDiscoveryQueryService.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { assert } from './support/Assert.js';
import { readSource as source } from './support/SourceText.js';

// 0.9.490 — Arweave Tagged Transaction Upload Implementation.
//
// tests/ArweaveAnnouncementDiscoveryCapabilityBoundaryAudit.test.js (0.9.489)
// confirmed uploadTaggedTransaction was the one missing capability boundary
// and sized its concrete implementation exactly: application/
// ArweaveTaggedTransactionUpload.js. This file is the focused implementation
// test the requesting brief asked for, never a second architecture audit.
//
//   Section A: data fidelity — the exact material reaches the transaction
//   Section B: tag fidelity — every supplied tag reaches the transaction unchanged
//   Section C: transaction submission — the injected signer/gateway invoked exactly as required
//   Section D: returned transaction identity surfaces correctly
//   Section E: failure propagation — signing/gateway failures keep the publisher's own semantics
//   Section F: no application logic — source sweep confirms a pure I/O adapter
//   Section G: existing publisher round trip — the real ArweaveAnnouncementPublisher,
//              wired to a REAL (fake-wallet-backed) ArweaveInjectedProviderSigner,
//              publishes, and the real, unmodified ArweaveGraphqlDiscoveryQueryService finds it

async function expectThrowsAsync(fn, message) {
    let error = null;
    try { await fn(); } catch (e) { error = e; }
    assert(error !== null, message);
    return error;
}

function fakeOkResponse(text = 'accepted') {
    return new Response(text, { status: 200 });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — data fidelity: the exact material reaches the
    // transaction handed to the gateway.
    // ---------------------------------------------------------------
    {
        let receivedMaterial = null;
        const signer = {
            async sign(material, tags) {
                receivedMaterial = material;
                return { id: 'DataFidelityTx0000000000000000000000000001', transaction: { format: 2, data: material, tags } };
            }
        };
        let postedBody = null;
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({
            signer,
            fetchImpl: async (url, options) => { postedBody = JSON.parse(options.body); return fakeOkResponse(); }
        });

        const material = JSON.stringify({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-a', uri: 'ar://material-a' });
        const result = await uploadTaggedTransaction(material, { name: 'ForkBuild-Discovery-Tag', value: 'campaign-a' });

        assert(receivedMaterial === material, 'A1. the exact string handed to uploadTaggedTransaction reaches signer.sign() byte-identical, never re-derived or re-serialized');
        assert(postedBody.data === material, 'A2. the exact material rides into the POSTed transaction body unchanged');
        assert(result.id === 'DataFidelityTx0000000000000000000000000001', 'A3. the signer\'s own deterministic id surfaces as this file\'s own return value');

        console.log('✓ Section A: data fidelity — the exact announcement payload reaches the transaction, never re-derived');
    }

    // ---------------------------------------------------------------
    // Section B — tag fidelity: every supplied tag reaches the
    // transaction unchanged, no adapter-side rewriting.
    // ---------------------------------------------------------------
    {
        let receivedTags = null;
        const signer = {
            async sign(material, tags) {
                receivedTags = tags;
                return { id: 'TagFidelityTx000000000000000000000000001A', transaction: { tags } };
            }
        };
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({
            signer,
            fetchImpl: async () => fakeOkResponse()
        });

        const tag = { name: 'ForkBuild-Discovery-Tag', value: 'campaign-b-exact-value' };
        await uploadTaggedTransaction('material-b', tag);

        assert(Array.isArray(receivedTags) && receivedTags.length === 1, 'B1. exactly one tag is ever forwarded to the signer — never expanded, never dropped');
        assert(receivedTags[0].name === tag.name && receivedTags[0].value === tag.value, 'B2. the tag\'s own name/value reach the signer byte-identical to what was supplied — no adapter-side tag rewriting');

        // A well-formed tag is never mutated in place either.
        const frozenTag = Object.freeze({ name: 'ForkBuild-Discovery-Tag', value: 'campaign-b2' });
        await uploadTaggedTransaction('material-b2', frozenTag);
        assert(frozenTag.name === 'ForkBuild-Discovery-Tag' && frozenTag.value === 'campaign-b2', 'B3. a frozen, caller-owned tag object is never mutated');

        // Malformed tags degrade to null before the signer/gateway are consulted.
        let signerCalled = false;
        const spyingSigner = { async sign() { signerCalled = true; return { id: 'x', transaction: {} }; } };
        const guardedUpload = createArweaveTaggedTransactionUpload({ signer: spyingSigner, fetchImpl: async () => fakeOkResponse() });
        for (const malformed of [null, undefined, {}, { name: 'x' }, { value: 'y' }, { name: '', value: 'y' }, { name: 'x', value: 5 }]) {
            const declined = await guardedUpload('some material', malformed);
            assert(declined === null, `B4. a malformed tag (${JSON.stringify(malformed)}) degrades to null`);
        }
        assert(signerCalled === false, 'B5. the signer is never consulted for a malformed tag');

        console.log('✓ Section B: tag fidelity — every supplied tag reaches the transaction unchanged, and a malformed tag never reaches the signer');
    }

    // ---------------------------------------------------------------
    // Section C — transaction submission: the existing signer/gateway
    // mechanism is invoked exactly as required.
    // ---------------------------------------------------------------
    {
        let signCalls = 0;
        let postCalls = 0;
        let postedUrl = null;
        let postedMethod = null;
        let postedHeaders = null;
        const signer = {
            async sign(material, tags) {
                signCalls += 1;
                return { id: 'SubmissionTx00000000000000000000000000001', transaction: { format: 2, data: material, tags } };
            }
        };
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({
            signer,
            gatewayUrl: 'https://my-gateway.example/',
            fetchImpl: async (url, options) => {
                postCalls += 1;
                postedUrl = url;
                postedMethod = options.method;
                postedHeaders = options.headers;
                return fakeOkResponse();
            }
        });

        await uploadTaggedTransaction('submission material', { name: 'n', value: 'v' });

        assert(signCalls === 1, 'C1. the signer is invoked exactly once per upload');
        assert(postCalls === 1, 'C2. the gateway is POSTed to exactly once per upload');
        assert(postedUrl === 'https://my-gateway.example/tx', 'C3. the POST targets exactly <gatewayUrl>/tx, trailing slash normalized');
        assert(postedMethod === 'POST', 'C4. the request method is POST');
        assert(postedHeaders['Content-Type'] === 'application/json', 'C5. the request declares a JSON content type');

        console.log('✓ Section C: the existing signer/provider is invoked exactly as required — one sign, one POST to <gatewayUrl>/tx');
    }

    // ---------------------------------------------------------------
    // Section D — returned transaction identity surfaces correctly.
    // ---------------------------------------------------------------
    {
        const signer = { async sign() { return { id: 'ReturnedIdTx00000000000000000000000000001', transaction: {} }; } };
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer, fetchImpl: async () => fakeOkResponse() });

        const result = await uploadTaggedTransaction('material-d', { name: 'n', value: 'v' });
        assert(result.id === 'ReturnedIdTx00000000000000000000000000001', 'D1. the transaction id the signer already deterministically computed is surfaced verbatim, never re-derived from the gateway response');

        // A gateway declining the POST resolves null, never a mismatched id.
        const decliningUpload = createArweaveTaggedTransactionUpload({
            signer,
            fetchImpl: async () => new Response('rejected', { status: 400 })
        });
        assert(await decliningUpload('material-d2', { name: 'n', value: 'v' }) === null, 'D2. a non-2xx gateway response resolves null, never a partial/incorrect id');

        console.log('✓ Section D: the transaction id returned by the substrate surfaces to the caller correctly');
    }

    // ---------------------------------------------------------------
    // Section E — failure propagation: signing/gateway failures retain
    // the publisher's existing failure semantics; never swallowed into
    // a manufactured success.
    // ---------------------------------------------------------------
    {
        // E1/E2 — a genuine signing failure propagates.
        const rejectingSigner = { async sign() { throw new Error('wallet locked'); } };
        const uploadWithRejectingSigner = createArweaveTaggedTransactionUpload({ signer: rejectingSigner, fetchImpl: async () => fakeOkResponse() });
        const signError = await expectThrowsAsync(() => uploadWithRejectingSigner('material-e1', { name: 'n', value: 'v' }), 'E1. a genuine signer.sign() rejection propagates, never swallowed into null');
        assert(/wallet locked/.test(signError.message), 'E2. the original signing failure reason is preserved, not replaced');

        // E3 — a genuine network failure propagates.
        const okSigner = { async sign() { return { id: 'NetFailTx0000000000000000000000000000001', transaction: {} }; } };
        const uploadWithNetworkFailure = createArweaveTaggedTransactionUpload({
            signer: okSigner,
            fetchImpl: async () => { throw new Error('network unreachable'); }
        });
        await expectThrowsAsync(() => uploadWithNetworkFailure('material-e3', { name: 'n', value: 'v' }), 'E3. a genuine transport failure propagates, never swallowed into null');

        // E4 — an ordinary gateway decline resolves null, not a throw.
        const uploadWithDecline = createArweaveTaggedTransactionUpload({
            signer: okSigner,
            fetchImpl: async () => new Response('bad request', { status: 400 })
        });
        assert(await uploadWithDecline('material-e4', { name: 'n', value: 'v' }) === null, 'E4. a non-2xx gateway response is an ordinary decline (null), never a thrown error — a genuine failure and an ordinary decline stay distinct outcomes');

        // E5 — a signer that resolves but violates its own contract (no id) throws, never null.
        const brokenSigner = { async sign() { return { id: '', transaction: {} }; } };
        const uploadWithBrokenSigner = createArweaveTaggedTransactionUpload({ signer: brokenSigner, fetchImpl: async () => fakeOkResponse() });
        const contractError = await expectThrowsAsync(() => uploadWithBrokenSigner('material-e5', { name: 'n', value: 'v' }), 'E5. a signer resolving with no valid id throws rather than degrading to null — a malformed collaborator response is a bug, not an ordinary decline');
        assert(/no valid transaction id/.test(contractError.message), 'E5b. the thrown error names the actual contract violation');

        // E6 — the SAME failure semantics, exercised through the real,
        // unmodified ArweaveAnnouncementPublisher, exactly as it already
        // expects (see that file's own header).
        const publisherWithFailingUpload = new ArweaveAnnouncementPublisher({
            discoveryTag: 'campaign-e6',
            uploadTaggedTransaction: uploadWithRejectingSigner
        });
        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-e6', uri: 'ar://material-e6' };
        await expectThrowsAsync(() => publisherWithFailingUpload.publish(envelope), 'E6. through the real ArweaveAnnouncementPublisher, a genuine signing failure still propagates as a rejection, never a manufactured success');

        const publisherWithDecliningUpload = new ArweaveAnnouncementPublisher({
            discoveryTag: 'campaign-e7',
            uploadTaggedTransaction: uploadWithDecline
        });
        assert(await publisherWithDecliningUpload.publish(envelope) === null, 'E7. through the real ArweaveAnnouncementPublisher, an ordinary gateway decline still resolves null, never a thrown error');

        console.log('✓ Section E: failure propagation — genuine signing/transport failures propagate, an ordinary gateway decline resolves null, and a broken collaborator contract throws; all three stay distinct, exactly as ArweaveAnnouncementPublisher.js already expects');
    }

    // ---------------------------------------------------------------
    // Section F — no application logic: source sweep confirms this file
    // never hashes content, generates tags, chooses a discovery
    // substrate, invokes Nostr, queries discovery, or resolves content.
    // ---------------------------------------------------------------
    {
        const adapterSource = await source('application/arweave/ArweaveTaggedTransactionUpload.js');
        const codeOnly = adapterSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/contentHash|sha256|crypto\.subtle|createHash/i.test(codeOnly), 'F1. never hashes content — no hashing primitive referenced');
        assert(!/discoveryTag\s*=|chooseCampaign|selectDiscoveryTag/.test(codeOnly), 'F2. never generates or selects a discovery tag of its own — a tag is only ever forwarded, never authored');
        assert(!/nostr|Nostr/.test(codeOnly), 'F3. never references Nostr or any sibling discovery substrate');
        assert(!/GraphqlDiscoveryQueryService|DecentralizedWorldDiscoveryQuery/.test(codeOnly), 'F4. never imports or queries a discovery service — write-only, never read');
        assert(!/WorldEncounterMaterialResolver|retrieveByUri/.test(codeOnly), 'F5. never resolves/retrieves content of any kind');
        assert(!/retry|setTimeout.*retry|attempt\s*\+\+/i.test(codeOnly.replace(/setTimeout\(\(\) => controller\.abort/g, '')), 'F6. never retries on its own — one signer call, one POST, per invocation');
        assert(!/new Set\(|new Map\(|_published|_seen|_history/.test(codeOnly), 'F7. no deduplication/idempotency bookkeeping of any kind');
        assert(featureImportLines(adapterSource).length === 0, 'F8. no dependencies besides shared utils/ helpers — a pure adapter over whatever signer/fetchImpl it is handed, no coupling to any other file in this codebase');

        console.log('✓ Section F: no application logic — source sweep confirms a pure I/O translation adapter with zero coupling to discovery, hashing, Nostr, or content resolution');
    }

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: existing publisher round trip, through a
    // REAL (fake-wallet-backed) ArweaveInjectedProviderSigner — never a
    // hand-rolled fake uploadTaggedTransaction, unlike 0.9.489's own
    // audit. Announcement -> ArweaveAnnouncementPublisher ->
    // uploadTaggedTransaction -> transaction -> transaction id, then a
    // real, unmodified ArweaveGraphqlDiscoveryQueryService finds it.
    // ---------------------------------------------------------------
    {
        const ledger = new Map(); // id -> { data, tags }
        let nextId = 0;
        const fakeWallet = {
            async connect() {},
            async sign(transaction) {
                nextId += 1;
                return { ...transaction, owner: 'fake-owner', signature: 'fake-signature', id: `RoundTripTx${String(nextId).padStart(8, '0')}` };
            }
        };
        const fakeGatewayFetch = async (url, options = {}) => {
            const parsed = new URL(url);
            const method = options.method || 'GET';

            if (method === 'GET' && parsed.pathname === '/tx_anchor') {
                return new Response('fake-anchor', { status: 200 });
            }
            if (method === 'GET' && /^\/price\//.test(parsed.pathname)) {
                return new Response('123456', { status: 200 });
            }
            if (method === 'POST' && parsed.pathname === '/tx') {
                const transaction = JSON.parse(options.body);
                ledger.set(transaction.id, { data: transaction.data, tags: transaction.tags });
                return new Response('accepted', { status: 200 });
            }
            if (method === 'POST' && parsed.pathname === '/graphql') {
                const { query } = JSON.parse(options.body);
                const match = query.match(/name:\s*"([^"]*)"\s*,\s*values:\s*\[\s*"([^"]*)"\s*\]/);
                const edges = [];
                if (match) {
                    const [, matchTagName, matchValue] = match;
                    // A real Arweave gateway's GraphQL index matches against
                    // a tag's own DECODED string value, even though the wire
                    // transaction stores name/value base64url-encoded (see
                    // arweave/ArweaveInjectedProviderSigner.js's own 0.9.490
                    // header) — decode before comparing, exactly as a real
                    // gateway's own indexer does.
                    for (const [id, entry] of ledger.entries()) {
                        const found = (entry.tags || []).some((t) => decodeBase64Url(t.name) === matchTagName && decodeBase64Url(t.value) === matchValue);
                        if (found) edges.push({ node: { id } });
                    }
                }
                return new Response(JSON.stringify({ data: { transactions: { edges } } }), { status: 200 });
            }
            // 0.9.494 — ArweaveGraphqlDiscoveryQueryService now performs one
            // additional raw GET per discovered transaction to decode its
            // own signed publication envelope; serve the real transaction's
            // own data, base64url-DECODED exactly as a real Arweave gateway
            // already returns raw transaction data (never the wire-encoded
            // form the signer produced).
            const getMatch = method === 'GET' && parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
            if (getMatch && ledger.has(getMatch[1])) {
                return new Response(decodeBase64Url(ledger.get(getMatch[1]).data), { status: 200 });
            }
            return new Response('not found', { status: 404 });
        };

        // The REAL, unmodified (0.9.121, extended 0.9.490) wallet-integrated
        // signer — never a fake uploadTaggedTransaction, unlike 0.9.489's
        // own audit, which explicitly deferred a concrete implementation.
        const realSigner = createArweaveInjectedProviderSigner({ injectedProvider: fakeWallet, fetchImpl: fakeGatewayFetch });
        assert(realSigner !== undefined, 'G0. sanity: the real signer resolves given a usable fake wallet');

        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({
            signer: realSigner,
            gatewayUrl: 'https://round-trip.example',
            fetchImpl: fakeGatewayFetch
        });

        // The REAL, unmodified ArweaveAnnouncementPublisher (0.9.428).
        const campaign = 'campaign-g-flagship';
        const publisher = new ArweaveAnnouncementPublisher({
            discoveryTag: campaign,
            gatewayUrl: 'https://round-trip.example',
            uploadTaggedTransaction
        });

        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-g-flagship', uri: 'ar://material-g-flagship'
        });
        const published = await publisher.publish(envelope);

        assert(published !== null && published.published === true, 'G1. Announcement -> ArweaveAnnouncementPublisher -> uploadTaggedTransaction -> transaction -> transaction id: the full chain succeeds end to end through the real signer implementation');
        assert(typeof published.id === 'string' && published.id.startsWith('RoundTripTx'), 'G2. the id returned all the way up to the publisher\'s own caller is the real signer\'s own deterministic id, unmodified');
        assert(ledger.has(published.id), 'G3. a real transaction record actually exists on the simulated substrate under that id');
        const ledgerEntry = ledger.get(published.id);
        assert(JSON.parse(decodeBase64Url(ledgerEntry.data)).objectId === 'pub-g-flagship', 'G4. the announced envelope\'s own data, base64url-decoded off the real transaction, is byte-identical to what was published');
        assert(ledgerEntry.tags.length === 1, 'G5. exactly one Arweave Tag reached the real signed transaction');
        const decodedTagName = decodeBase64Url(ledgerEntry.tags[0].name);
        const decodedTagValue = decodeBase64Url(ledgerEntry.tags[0].value);
        assert(decodedTagName === ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME, 'G6. the tag NAME on the real signed transaction is exactly the literal the real reader already expects');
        assert(decodedTagValue === campaign, 'G7. the tag VALUE on the real signed transaction is exactly the application-level discoveryTag');

        // Now the real, unmodified discovery-query service actually finds it.
        const discoveryQueryService = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: fakeGatewayFetch, graphqlUrl: 'https://round-trip.example/graphql' });
        const candidates = await discoveryQueryService.search(campaign);
        assert(candidates.length === 1 && candidates[0].uri === 'ar://material-g-flagship' && candidates[0].announcementId === published.id, 'G8. the real ArweaveGraphqlDiscoveryQueryService (0.9.494, envelope-aware) finds exactly this real, tagged, wallet-signed transaction, decodes its own envelope, and reports the announced MATERIAL\'s own uri — with the announcement transaction id preserved alongside it — the full brief\'s own diagram (ArweaveAnnouncementPublisher -> uploadTaggedTransaction -> Arweave transaction -> data/tags -> ArweaveGraphqlDiscoveryQueryService) closes end to end');

        console.log('✓ Section G: FLAGSHIP — the real ArweaveAnnouncementPublisher, wired to this file\'s uploadTaggedTransaction and a REAL (fake-wallet-backed) ArweaveInjectedProviderSigner, publishes a real signed+tagged transaction that the real, unmodified ArweaveGraphqlDiscoveryQueryService actually finds');
    }

    console.log('\n✅ All ArweaveTaggedTransactionUpload tests passed.');
}

// The inverse of arweave/ArweaveInjectedProviderSigner.js's own private
// base64UrlEncode() — needed only to decode this test's own assertions
// (and Section G's own fake gateway) against the real signed transaction;
// not exported by that file, so reimplemented here, independently, per
// this whole family's own "two independent files" convention.
function decodeBase64Url(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}

run().catch((error) => {
    console.error('ArweaveTaggedTransactionUpload.test.js FAILED:', error);
    process.exitCode = 1;
});
